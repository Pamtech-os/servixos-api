import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Job } from 'agenda';
import * as ExcelJS from 'exceljs';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { JOBS } from 'src/common/constants/agenda.constants';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { StorageService } from 'src/modules/storage/storage.service';
import { STORAGE_FOLDERS } from 'src/modules/storage/constants/storage-folders.constants';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import {
  ReportFormat,
  ReportStatus,
  ReportType,
} from '../schemas/admin-report.schema';
import {
  ScheduleFrequency,
  ScheduleStatus,
} from '../schemas/admin-report-schedule.schema';
import { AdminReportsRepository } from '../repositories/admin-reports.repository';
import {
  CreateReportDto,
  FREQUENCY_TO_SCHEDULE,
  ReportFrequency,
} from '../dto/create-report.dto';
import { QueryReportsDto } from '../dto/query-reports.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';

interface ReportGenerateJobData {
  reportId: string;
}

interface ReportScheduleTickJobData {
  scheduleId?: string;
}

/** Number of days to advance nextRunAt for each frequency. */
const FREQUENCY_INTERVAL_DAYS: Record<ScheduleFrequency, number> = {
  [ScheduleFrequency.DAILY]: 1,
  [ScheduleFrequency.WEEKLY]: 7,
  [ScheduleFrequency.MONTHLY]: 30,
};

@Injectable()
export class AdminReportsService implements OnModuleInit {
  private readonly logger = new Logger(AdminReportsService.name);

  constructor(
    private readonly reportsRepository: AdminReportsRepository,
    private readonly agendaService: AgendaService,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit(): void {
    this.agendaService.define(JOBS.REPORT_GENERATE, async (job: Job) => {
      const { reportId } = job.attrs.data as ReportGenerateJobData;
      await this.runReportGeneration(reportId);
    });

    this.agendaService.define(JOBS.REPORT_SCHEDULE_TICK, async (job: Job) => {
      const data = job.attrs.data as ReportScheduleTickJobData | undefined;
      // If scheduleId supplied, run that specific schedule; otherwise sweep all due ones
      if (data?.scheduleId) {
        await this.runScheduledReport(data.scheduleId);
      } else {
        await this.sweepDueSchedules();
      }
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Aggregate stats: total reports, ready, active schedules, distinct types. */
  async getStats() {
    try {
      const { total, ready, activeSchedules } =
        await this.reportsRepository.getStats();
      return {
        totalReports: total,
        readyToDownload: ready,
        activeSchedules,
        reportTypes: Object.keys(ReportType).length,
      };
    } catch (error) {
      this.logger.error(
        `getStats: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Paginated report history. */
  async listReports(dto: QueryReportsDto) {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const { data, total } = await this.reportsRepository.findReports(
        { type: dto.type },
        pagination,
      );
      return {
        reports: data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    } catch (error) {
      this.logger.error(
        `listReports: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Paginated schedule list. */
  async listSchedules(dto: PaginationDto) {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const { data, total } =
        await this.reportsRepository.findSchedules(pagination);
      return {
        schedules: data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    } catch (error) {
      this.logger.error(
        `listSchedules: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Generate a report (one-time) or create a schedule (recurring).
   * Returns immediately with the pending report; generation runs in background.
   */
  async generateReport(dto: CreateReportDto) {
    try {
      const dateFrom = new Date(dto.dateFrom);
      const dateTo = new Date(dto.dateTo);
      const name =
        dto.name ?? this.buildDefaultName(dto.type, dateFrom, dateTo);
      const isRecurring =
        dto.frequency && dto.frequency !== ReportFrequency.ONE_TIME;

      if (isRecurring) {
        const scheduleFrequency = FREQUENCY_TO_SCHEDULE[dto.frequency!]!;
        const nextRunAt = new Date();

        const schedule = await this.reportsRepository.createSchedule({
          name,
          type: dto.type,
          format: dto.format,
          frequency: scheduleFrequency,
          nextRunAt,
        });

        // Fire first run immediately
        await this.agendaService.now<ReportScheduleTickJobData>(
          JOBS.REPORT_SCHEDULE_TICK,
          { scheduleId: schedule._id.toString() },
        );

        return { schedule };
      }

      // One-time report
      const report = await this.reportsRepository.createReport({
        name,
        type: dto.type,
        dateFrom,
        dateTo,
        format: dto.format,
      });

      await this.agendaService.now<ReportGenerateJobData>(
        JOBS.REPORT_GENERATE,
        {
          reportId: report._id.toString(),
        },
      );

      return { report };
    } catch (error) {
      this.logger.error(
        `generateReport: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Return the download URL for a ready report. */
  async getDownloadUrl(id: string) {
    try {
      const report = await this.reportsRepository.findReportById(id);
      if (!report)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.REPORT_NOT_FOUND);
      if (report.status !== ReportStatus.READY || !report.fileUrl) {
        return new NotFoundException(ADMIN_MESSAGES.ERROR.REPORT_NOT_READY);
      }
      return { url: report.fileUrl };
    } catch (error) {
      this.logger.error(
        `getDownloadUrl: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Delete a report and remove its stored file. */
  async deleteReport(id: string) {
    try {
      const report = await this.reportsRepository.findReportById(id);
      if (!report)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.REPORT_NOT_FOUND);

      if (report.filePublicId) {
        await this.storageService
          .delete(report.filePublicId)
          .catch((err: unknown) =>
            this.logger.warn(
              `deleteReport: storage delete failed [${String(err)}]`,
            ),
          );
      }

      await this.reportsRepository.deleteReport(id);
      return null;
    } catch (error) {
      this.logger.error(
        `deleteReport: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Pause an active schedule. */
  async pauseSchedule(id: string) {
    try {
      const schedule = await this.reportsRepository.findScheduleById(id);
      if (!schedule)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.SCHEDULE_NOT_FOUND);
      await this.reportsRepository.updateSchedule(id, {
        status: ScheduleStatus.PAUSED,
      });
      return null;
    } catch (error) {
      this.logger.error(
        `pauseSchedule: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Resume a paused schedule. */
  async resumeSchedule(id: string) {
    try {
      const schedule = await this.reportsRepository.findScheduleById(id);
      if (!schedule)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.SCHEDULE_NOT_FOUND);
      await this.reportsRepository.updateSchedule(id, {
        status: ScheduleStatus.ACTIVE,
      });
      return null;
    } catch (error) {
      this.logger.error(
        `resumeSchedule: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Trigger an immediate run of a schedule. */
  async runScheduleNow(id: string) {
    try {
      const schedule = await this.reportsRepository.findScheduleById(id);
      if (!schedule)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.SCHEDULE_NOT_FOUND);
      await this.agendaService.now<ReportScheduleTickJobData>(
        JOBS.REPORT_SCHEDULE_TICK,
        { scheduleId: id },
      );
      return null;
    } catch (error) {
      this.logger.error(
        `runScheduleNow: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Delete a schedule (does not delete past reports generated by it). */
  async deleteSchedule(id: string) {
    try {
      const schedule = await this.reportsRepository.findScheduleById(id);
      if (!schedule)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.SCHEDULE_NOT_FOUND);
      await this.reportsRepository.deleteSchedule(id);
      return null;
    } catch (error) {
      this.logger.error(
        `deleteSchedule: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  // ─── Job processors ─────────────────────────────────────────────────────────

  /** Runs inside the `report:generate` Agenda job. */
  private async runReportGeneration(reportId: string): Promise<void> {
    await this.reportsRepository.updateReport(reportId, {
      status: ReportStatus.PROCESSING,
    });

    try {
      const report = await this.reportsRepository.findReportById(reportId);
      if (!report) throw new Error(`Report not found: ${reportId}`);

      const rows = await this.fetchData(
        report.type,
        report.dateFrom,
        report.dateTo,
      );

      const format = report.format;
      const buffer =
        format === ReportFormat.EXCEL
          ? await this.buildExcel(report.name, rows)
          : this.buildCsv(rows);

      const ext = format === ReportFormat.EXCEL ? 'xlsx' : 'csv';
      const filename = `report-${reportId}-${Date.now()}.${ext}`;

      const { url, publicId } = await this.storageService.uploadBuffer(
        buffer,
        STORAGE_FOLDERS.adminReports,
        filename,
      );

      await this.reportsRepository.updateReport(reportId, {
        status: ReportStatus.READY,
        rowCount: rows.length,
        fileSizeBytes: buffer.length,
        fileUrl: url,
        filePublicId: publicId,
      });
    } catch (err) {
      this.logger.error(`runReportGeneration [${reportId}]: ${String(err)}`);
      await this.reportsRepository.updateReport(reportId, {
        status: ReportStatus.FAILED,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Creates a report from a schedule config and advances nextRunAt. */
  private async runScheduledReport(scheduleId: string): Promise<void> {
    const schedule = await this.reportsRepository.findScheduleById(scheduleId);
    if (!schedule || schedule.status === ScheduleStatus.PAUSED) return;

    const now = new Date();
    const dateFrom =
      schedule.lastRunAt ?? new Date(now.getTime() - 7 * 86_400_000);
    const dateTo = now;

    const report = await this.reportsRepository.createReport({
      name: schedule.name,
      type: schedule.type,
      dateFrom,
      dateTo,
      format: schedule.format,
    });

    const days = FREQUENCY_INTERVAL_DAYS[schedule.frequency] ?? 1;
    const nextRunAt = new Date(now.getTime() + days * 86_400_000);

    await this.reportsRepository.updateSchedule(scheduleId, {
      lastRunAt: now,
      nextRunAt,
    });

    await this.agendaService.now<ReportGenerateJobData>(JOBS.REPORT_GENERATE, {
      reportId: report._id.toString(),
    });
  }

  /** Sweep all due schedules — called when no specific scheduleId is provided. */
  private async sweepDueSchedules(): Promise<void> {
    const due = await this.reportsRepository.findDueSchedules();
    await Promise.all(
      due.map((s) => this.runScheduledReport(s._id.toString())),
    );
  }

  // ─── File builders ──────────────────────────────────────────────────────────

  private buildCsv(rows: Record<string, unknown>[]): Buffer {
    if (!rows.length) return Buffer.from('', 'utf-8');

    const headers = Object.keys(rows[0]);
    const escape = (val: unknown): string => {
      let s: string;
      if (val === null || val === undefined) {
        s = '';
      } else if (val instanceof Date) {
        s = val.toISOString();
      } else if (typeof val === 'object') {
        s = JSON.stringify(val);
      } else {
        s = String(val as string | number | boolean | bigint);
      }
      s = s.replace(/"/g, '""');
      return s.includes(',') || s.includes('\n') || s.includes('"')
        ? `"${s}"`
        : s;
    };

    const lines = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
    ];

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  private async buildExcel(
    sheetName: string,
    rows: Record<string, unknown>[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName.slice(0, 31)); // Excel sheet name max 31 chars

    if (rows.length) {
      const headers = Object.keys(rows[0]);
      sheet.columns = headers.map((h) => ({
        header: this.toHeaderLabel(h),
        key: h,
        width: 20,
      }));
      sheet.addRows(rows);

      // Bold header row
      sheet.getRow(1).font = { bold: true };
    }

    return workbook.xlsx.writeBuffer() as Promise<Buffer>;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async fetchData(
    type: ReportType,
    from: Date,
    to: Date,
  ): Promise<Record<string, unknown>[]> {
    // Lookup map for O(1) dispatch by report type
    const fetchers: Record<
      ReportType,
      () => Promise<Record<string, unknown>[]>
    > = {
      [ReportType.USERS]: () => this.reportsRepository.fetchUsersData(from, to),
      [ReportType.REVENUE]: () =>
        this.reportsRepository.fetchRevenueData(from, to),
      [ReportType.BUSINESSES]: () =>
        this.reportsRepository.fetchBusinessesData(from, to),
      [ReportType.ACTIVITY_LOG]: () =>
        this.reportsRepository.fetchActivityLogData(from, to),
      [ReportType.SUBSCRIPTIONS]: () =>
        this.reportsRepository.fetchSubscriptionsData(from, to),
      [ReportType.AI_USAGE]: () =>
        this.reportsRepository.fetchAiUsageData(from, to),
    };
    return fetchers[type]();
  }

  private buildDefaultName(type: ReportType, from: Date, to: Date): string {
    const label = type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    return `${label} — ${fmt(from)} to ${fmt(to)}`;
  }

  private toHeaderLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }
}
