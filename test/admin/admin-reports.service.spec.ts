import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminReportsService } from 'src/modules/admin/services/admin-reports.service';
import { AdminReportsRepository } from 'src/modules/admin/repositories/admin-reports.repository';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { StorageService } from 'src/modules/storage/storage.service';
import {
  ReportFormat,
  ReportStatus,
  ReportType,
} from 'src/modules/admin/schemas/admin-report.schema';
import { ScheduleStatus } from 'src/modules/admin/schemas/admin-report-schedule.schema';
import { ReportFrequency } from 'src/modules/admin/dto/create-report.dto';
import { asMock } from 'test/helpers/mock';

const REPORT_ID = new Types.ObjectId();
const SCHEDULE_ID = new Types.ObjectId();

const makeReport = (overrides: Record<string, unknown> = {}) => ({
  _id: REPORT_ID,
  name: 'Users — Jun 2026',
  type: ReportType.USERS,
  dateFrom: new Date('2026-06-01'),
  dateTo: new Date('2026-06-30'),
  format: ReportFormat.CSV,
  status: ReportStatus.PENDING,
  ...overrides,
});

const makeSchedule = (overrides: Record<string, unknown> = {}) => ({
  _id: SCHEDULE_ID,
  name: 'Weekly Users Digest',
  type: ReportType.USERS,
  format: ReportFormat.EXCEL,
  frequency: 'weekly',
  status: ScheduleStatus.ACTIVE,
  nextRunAt: new Date(),
  ...overrides,
});

describe('AdminReportsService', () => {
  let service: AdminReportsService;
  let repo: {
    getStats: jest.Mock;
    findReports: jest.Mock;
    findSchedules: jest.Mock;
    createReport: jest.Mock;
    createSchedule: jest.Mock;
    findReportById: jest.Mock;
    findScheduleById: jest.Mock;
    updateReport: jest.Mock;
    updateSchedule: jest.Mock;
    deleteReport: jest.Mock;
    deleteSchedule: jest.Mock;
    findDueSchedules: jest.Mock;
    fetchUsersData: jest.Mock;
    fetchRevenueData: jest.Mock;
    fetchBusinessesData: jest.Mock;
    fetchActivityLogData: jest.Mock;
    fetchSubscriptionsData: jest.Mock;
    fetchAiUsageData: jest.Mock;
  };
  let agendaService: { now: jest.Mock; define: jest.Mock };
  let storageService: { uploadBuffer: jest.Mock; delete: jest.Mock };

  beforeEach(() => {
    repo = {
      getStats: jest
        .fn()
        .mockResolvedValue({ total: 6, ready: 5, activeSchedules: 3 }),
      findReports: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findSchedules: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      createReport: jest.fn().mockResolvedValue(makeReport()),
      createSchedule: jest.fn().mockResolvedValue(makeSchedule()),
      findReportById: jest.fn().mockResolvedValue(null),
      findScheduleById: jest.fn().mockResolvedValue(null),
      updateReport: jest.fn().mockResolvedValue(undefined),
      updateSchedule: jest.fn().mockResolvedValue(undefined),
      deleteReport: jest.fn().mockResolvedValue(undefined),
      deleteSchedule: jest.fn().mockResolvedValue(undefined),
      findDueSchedules: jest.fn().mockResolvedValue([]),
      fetchUsersData: jest.fn().mockResolvedValue([]),
      fetchRevenueData: jest.fn().mockResolvedValue([]),
      fetchBusinessesData: jest.fn().mockResolvedValue([]),
      fetchActivityLogData: jest.fn().mockResolvedValue([]),
      fetchSubscriptionsData: jest.fn().mockResolvedValue([]),
      fetchAiUsageData: jest.fn().mockResolvedValue([]),
    };

    agendaService = {
      now: jest.fn().mockResolvedValue(undefined),
      define: jest.fn(),
    };

    storageService = {
      uploadBuffer: jest.fn().mockResolvedValue({
        url: 'https://cdn.example.com/report.csv',
        publicId: 'admin-reports/report.csv',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    service = new AdminReportsService(
      asMock<AdminReportsRepository>(repo),
      asMock<AgendaService>(agendaService),
      asMock<StorageService>(storageService),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── onModuleInit ────────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('should register both report job processors with agendaService', () => {
      // Arrange — nothing extra

      // Act
      service.onModuleInit();

      // Assert
      expect(agendaService.define).toHaveBeenCalledTimes(2);
      expect(agendaService.define).toHaveBeenCalledWith(
        'report:generate',
        expect.any(Function),
      );
      expect(agendaService.define).toHaveBeenCalledWith(
        'report:schedule:tick',
        expect.any(Function),
      );
    });
  });

  // ─── getStats ────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return totalReports, readyToDownload, activeSchedules, and reportTypes', async () => {
      // Arrange — repo default returns { total: 6, ready: 5, activeSchedules: 3 }

      // Act
      const result = await service.getStats();

      // Assert
      expect(result).toMatchObject({
        totalReports: 6,
        readyToDownload: 5,
        activeSchedules: 3,
        reportTypes: 6,
      });
    });

    it('should return InternalServerErrorException on repository failure', async () => {
      // Arrange
      repo.getStats.mockRejectedValue(new Error('DB down'));

      // Act
      const result = await service.getStats();

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── listReports ─────────────────────────────────────────────────────────────

  describe('listReports', () => {
    it('should return paginated reports with meta', async () => {
      // Arrange
      repo.findReports.mockResolvedValue({ data: [makeReport()], total: 1 });

      // Act
      const result = await service.listReports({ page: 1, limit: 10 });

      // Assert
      expect(result).toHaveProperty('reports');
      expect(result).toHaveProperty('meta.total', 1);
    });

    it('should return InternalServerErrorException on failure', async () => {
      // Arrange
      repo.findReports.mockRejectedValue(new Error('fail'));

      // Act
      const result = await service.listReports({});

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── listSchedules ───────────────────────────────────────────────────────────

  describe('listSchedules', () => {
    it('should return paginated schedules with meta', async () => {
      // Arrange
      repo.findSchedules.mockResolvedValue({
        data: [makeSchedule()],
        total: 1,
      });

      // Act
      const result = await service.listSchedules({ page: 1, limit: 10 });

      // Assert
      expect(result).toHaveProperty('schedules');
      expect(result).toHaveProperty('meta.total', 1);
    });
  });

  // ─── generateReport (one-time) ────────────────────────────────────────────────

  describe('generateReport (one-time)', () => {
    const dto = {
      type: ReportType.USERS,
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      format: ReportFormat.CSV,
      frequency: ReportFrequency.ONE_TIME,
    };

    it('should create a report record and queue a generate job', async () => {
      // Arrange
      repo.createReport.mockResolvedValue(makeReport());

      // Act
      const result = await service.generateReport(dto);

      // Assert
      expect(repo.createReport).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ReportType.USERS,
          format: ReportFormat.CSV,
        }),
      );
      expect(agendaService.now).toHaveBeenCalledWith('report:generate', {
        reportId: REPORT_ID.toString(),
      });
      expect(result).toHaveProperty('report');
      expect(result).not.toHaveProperty('schedule');
    });

    it('should auto-generate a name when none is provided', async () => {
      // Arrange — nothing extra

      // Act
      await service.generateReport(dto);

      // Assert — name should be auto-built
      const call = repo.createReport.mock.calls[0] as [{ name: string }];
      expect(call[0].name).toContain('Users');
    });

    it('should use the provided name when supplied', async () => {
      // Arrange
      const namedDto = { ...dto, name: 'My Custom Report' };

      // Act
      await service.generateReport(namedDto);

      // Assert
      const call = repo.createReport.mock.calls[0] as [{ name: string }];
      expect(call[0].name).toBe('My Custom Report');
    });

    it('should return InternalServerErrorException on failure', async () => {
      // Arrange
      repo.createReport.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.generateReport(dto);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── generateReport (recurring) ──────────────────────────────────────────────

  describe('generateReport (recurring schedule)', () => {
    it('should create a schedule and trigger immediate run via schedule tick job', async () => {
      // Arrange
      repo.createSchedule.mockResolvedValue(makeSchedule());
      const dto = {
        type: ReportType.REVENUE,
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        format: ReportFormat.EXCEL,
        frequency: ReportFrequency.WEEKLY,
      };

      // Act
      const result = await service.generateReport(dto);

      // Assert
      expect(repo.createSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ReportType.REVENUE,
          frequency: 'weekly',
        }),
      );
      expect(agendaService.now).toHaveBeenCalledWith('report:schedule:tick', {
        scheduleId: SCHEDULE_ID.toString(),
      });
      expect(result).toHaveProperty('schedule');
      expect(result).not.toHaveProperty('report');
    });
  });

  // ─── getDownloadUrl ──────────────────────────────────────────────────────────

  describe('getDownloadUrl', () => {
    it('should return fileUrl for a ready report', async () => {
      // Arrange
      repo.findReportById.mockResolvedValue(
        makeReport({
          status: ReportStatus.READY,
          fileUrl: 'https://cdn.example.com/r.csv',
        }),
      );

      // Act
      const result = await service.getDownloadUrl(REPORT_ID.toString());

      // Assert
      expect(result).toEqual({ url: 'https://cdn.example.com/r.csv' });
    });

    it('should return NotFoundException when report does not exist', async () => {
      // Arrange
      repo.findReportById.mockResolvedValue(null);

      // Act
      const result = await service.getDownloadUrl('bad-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should return NotFoundException when report is not yet ready', async () => {
      // Arrange
      repo.findReportById.mockResolvedValue(
        makeReport({ status: ReportStatus.PENDING }),
      );

      // Act
      const result = await service.getDownloadUrl(REPORT_ID.toString());

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── deleteReport ────────────────────────────────────────────────────────────

  describe('deleteReport', () => {
    it('should delete report record and its stored file', async () => {
      // Arrange
      repo.findReportById.mockResolvedValue(
        makeReport({ filePublicId: 'admin-reports/report.csv' }),
      );

      // Act
      const result = await service.deleteReport(REPORT_ID.toString());

      // Assert
      expect(result).toBeNull();
      expect(storageService.delete).toHaveBeenCalledWith(
        'admin-reports/report.csv',
      );
      expect(repo.deleteReport).toHaveBeenCalledWith(REPORT_ID.toString());
    });

    it('should skip storage delete when no filePublicId is set', async () => {
      // Arrange
      repo.findReportById.mockResolvedValue(
        makeReport({ filePublicId: undefined }),
      );

      // Act
      await service.deleteReport(REPORT_ID.toString());

      // Assert
      expect(storageService.delete).not.toHaveBeenCalled();
    });

    it('should return NotFoundException when report does not exist', async () => {
      // Arrange — repo.findReportById returns null by default

      // Act
      const result = await service.deleteReport('bad-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── pauseSchedule ───────────────────────────────────────────────────────────

  describe('pauseSchedule', () => {
    it('should set schedule status to paused', async () => {
      // Arrange
      repo.findScheduleById.mockResolvedValue(makeSchedule());

      // Act
      const result = await service.pauseSchedule(SCHEDULE_ID.toString());

      // Assert
      expect(result).toBeNull();
      expect(repo.updateSchedule).toHaveBeenCalledWith(SCHEDULE_ID.toString(), {
        status: ScheduleStatus.PAUSED,
      });
    });

    it('should return NotFoundException when schedule does not exist', async () => {
      // Arrange — repo.findScheduleById returns null by default

      // Act
      const result = await service.pauseSchedule('bad-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── resumeSchedule ──────────────────────────────────────────────────────────

  describe('resumeSchedule', () => {
    it('should set schedule status back to active', async () => {
      // Arrange
      repo.findScheduleById.mockResolvedValue(
        makeSchedule({ status: ScheduleStatus.PAUSED }),
      );

      // Act
      const result = await service.resumeSchedule(SCHEDULE_ID.toString());

      // Assert
      expect(result).toBeNull();
      expect(repo.updateSchedule).toHaveBeenCalledWith(SCHEDULE_ID.toString(), {
        status: ScheduleStatus.ACTIVE,
      });
    });
  });

  // ─── runScheduleNow ──────────────────────────────────────────────────────────

  describe('runScheduleNow', () => {
    it('should trigger the schedule tick job immediately', async () => {
      // Arrange
      repo.findScheduleById.mockResolvedValue(makeSchedule());

      // Act
      const result = await service.runScheduleNow(SCHEDULE_ID.toString());

      // Assert
      expect(result).toBeNull();
      expect(agendaService.now).toHaveBeenCalledWith('report:schedule:tick', {
        scheduleId: SCHEDULE_ID.toString(),
      });
    });

    it('should return NotFoundException when schedule does not exist', async () => {
      // Arrange — repo.findScheduleById returns null by default

      // Act
      const result = await service.runScheduleNow('bad-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── deleteSchedule ──────────────────────────────────────────────────────────

  describe('deleteSchedule', () => {
    it('should delete the schedule record', async () => {
      // Arrange
      repo.findScheduleById.mockResolvedValue(makeSchedule());

      // Act
      const result = await service.deleteSchedule(SCHEDULE_ID.toString());

      // Assert
      expect(result).toBeNull();
      expect(repo.deleteSchedule).toHaveBeenCalledWith(SCHEDULE_ID.toString());
    });

    it('should return NotFoundException when schedule does not exist', async () => {
      // Arrange — repo.findScheduleById returns null by default

      // Act
      const result = await service.deleteSchedule('bad-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });
});
