import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Business } from '../../business/schemas/business.schema';
import { Payment } from '../../payments/schemas/payment.schema';
import { ActivityLog } from '../../activity-logs/schemas/activity-log.schema';
import {
  AdminReport,
  ReportStatus,
  ReportType,
} from '../schemas/admin-report.schema';
import {
  AdminReportSchedule,
  ScheduleStatus,
} from '../schemas/admin-report-schedule.schema';
import { PaginationParams } from 'src/common/utils/pagination.util';

export interface ReportListItem {
  _id: Types.ObjectId;
  name: string;
  type: ReportType;
  dateFrom: Date;
  dateTo: Date;
  format: string;
  status: string;
  rowCount?: number;
  fileSizeBytes?: number;
  fileUrl?: string;
  createdAt: Date;
}

export interface ScheduleListItem {
  _id: Types.ObjectId;
  name: string;
  type: ReportType;
  format: string;
  frequency: string;
  status: string;
  nextRunAt?: Date;
  lastRunAt?: Date;
  createdAt: Date;
}

export interface ReportStats {
  total: number;
  ready: number;
  activeSchedules: number;
}

@Injectable()
export class AdminReportsRepository {
  private readonly reportModel: ReturnModelType<typeof AdminReport>;
  private readonly scheduleModel: ReturnModelType<typeof AdminReportSchedule>;
  private readonly userModel: ReturnModelType<typeof User>;
  private readonly businessModel: ReturnModelType<typeof Business>;
  private readonly paymentModel: ReturnModelType<typeof Payment>;
  private readonly activityLogModel: ReturnModelType<typeof ActivityLog>;

  constructor(@InjectConnection() connection: Connection) {
    this.reportModel = getModelForClass(AdminReport, {
      existingConnection: connection,
    });
    this.scheduleModel = getModelForClass(AdminReportSchedule, {
      existingConnection: connection,
    });
    this.userModel = getModelForClass(User, { existingConnection: connection });
    this.businessModel = getModelForClass(Business, {
      existingConnection: connection,
    });
    this.paymentModel = getModelForClass(Payment, {
      existingConnection: connection,
    });
    this.activityLogModel = getModelForClass(ActivityLog, {
      existingConnection: connection,
    });
  }

  // ─── Report CRUD ────────────────────────────────────────────────────────────

  async createReport(data: {
    name: string;
    type: ReportType;
    dateFrom: Date;
    dateTo: Date;
    format: string;
  }): Promise<AdminReport & { _id: Types.ObjectId }> {
    return this.reportModel.create(data) as Promise<
      AdminReport & { _id: Types.ObjectId }
    >;
  }

  async findReports(
    filters: { type?: ReportType },
    pagination: PaginationParams,
  ): Promise<{ data: ReportListItem[]; total: number }> {
    const match: Record<string, unknown> = {};
    if (filters.type) match['type'] = filters.type;

    const [countResult, data] = await Promise.all([
      this.reportModel.countDocuments(match).exec(),
      this.reportModel
        .find(match)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<ReportListItem[]>()
        .exec(),
    ]);

    return { data, total: countResult };
  }

  async findReportById(id: string): Promise<AdminReport | null> {
    return this.reportModel.findById(id).lean<AdminReport>().exec();
  }

  async updateReport(id: string, update: Partial<AdminReport>): Promise<void> {
    await this.reportModel.findByIdAndUpdate(id, { $set: update }).exec();
  }

  async deleteReport(id: string): Promise<void> {
    await this.reportModel.findByIdAndDelete(id).exec();
  }

  async getStats(): Promise<ReportStats> {
    const [total, ready, activeSchedules] = await Promise.all([
      this.reportModel.countDocuments().exec(),
      this.reportModel.countDocuments({ status: ReportStatus.READY }).exec(),
      this.scheduleModel
        .countDocuments({ status: ScheduleStatus.ACTIVE })
        .exec(),
    ]);
    return { total, ready, activeSchedules };
  }

  // ─── Schedule CRUD ──────────────────────────────────────────────────────────

  async createSchedule(data: {
    name: string;
    type: ReportType;
    format: string;
    frequency: string;
    nextRunAt: Date;
  }): Promise<AdminReportSchedule & { _id: Types.ObjectId }> {
    return this.scheduleModel.create(data) as Promise<
      AdminReportSchedule & { _id: Types.ObjectId }
    >;
  }

  async findSchedules(
    pagination: PaginationParams,
  ): Promise<{ data: ScheduleListItem[]; total: number }> {
    const [total, data] = await Promise.all([
      this.scheduleModel.countDocuments().exec(),
      this.scheduleModel
        .find()
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<ScheduleListItem[]>()
        .exec(),
    ]);
    return { data, total };
  }

  async findScheduleById(id: string): Promise<AdminReportSchedule | null> {
    return this.scheduleModel.findById(id).lean<AdminReportSchedule>().exec();
  }

  async updateSchedule(
    id: string,
    update: Partial<AdminReportSchedule>,
  ): Promise<void> {
    await this.scheduleModel.findByIdAndUpdate(id, { $set: update }).exec();
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.scheduleModel.findByIdAndDelete(id).exec();
  }

  /** Find active schedules whose nextRunAt is in the past — used by the schedule tick job. */
  async findDueSchedules(): Promise<
    (AdminReportSchedule & { _id: Types.ObjectId })[]
  > {
    return this.scheduleModel
      .find({ status: ScheduleStatus.ACTIVE, nextRunAt: { $lte: new Date() } })
      .lean<(AdminReportSchedule & { _id: Types.ObjectId })[]>()
      .exec();
  }

  // ─── Data queries per report type ───────────────────────────────────────────

  async fetchUsersData(
    from: Date,
    to: Date,
  ): Promise<Record<string, unknown>[]> {
    return this.userModel
      .find({ createdAt: { $gte: from, $lte: to }, deletedAt: null })
      .select('firstName lastName email userRole isActive createdAt')
      .sort({ createdAt: -1 })
      .lean<Record<string, unknown>[]>()
      .exec();
  }

  async fetchRevenueData(
    from: Date,
    to: Date,
  ): Promise<Record<string, unknown>[]> {
    return this.paymentModel
      .find({ paymentDate: { $gte: from, $lte: to }, deletedAt: null })
      .select('amount status paymentDate paymentMode notes createdAt')
      .sort({ paymentDate: -1 })
      .lean<Record<string, unknown>[]>()
      .exec();
  }

  async fetchBusinessesData(
    from: Date,
    to: Date,
  ): Promise<Record<string, unknown>[]> {
    return this.businessModel
      .aggregate<Record<string, unknown>>([
        { $match: { createdAt: { $gte: from, $lte: to }, deletedAt: null } },
        {
          $lookup: {
            from: 'users',
            localField: 'ownerId',
            foreignField: '_id',
            as: 'owner',
            pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1 } }],
          },
        },
        {
          $addFields: {
            ownerName: {
              $concat: [
                { $arrayElemAt: ['$owner.firstName', 0] },
                ' ',
                { $arrayElemAt: ['$owner.lastName', 0] },
              ],
            },
            ownerEmail: { $arrayElemAt: ['$owner.email', 0] },
          },
        },
        {
          $project: {
            name: 1,
            subdomain: 1,
            ownerName: 1,
            ownerEmail: 1,
            'subscription.plan': 1,
            'subscription.status': 1,
            isSuspended: 1,
            createdAt: 1,
          },
        },
        { $sort: { createdAt: -1 } },
      ])
      .exec();
  }

  async fetchActivityLogData(
    from: Date,
    to: Date,
  ): Promise<Record<string, unknown>[]> {
    return this.activityLogModel
      .find({ createdAt: { $gte: from, $lte: to } })
      .select('actorName actorRole action category target createdAt')
      .sort({ createdAt: -1 })
      .lean<Record<string, unknown>[]>()
      .exec();
  }

  async fetchSubscriptionsData(
    from: Date,
    to: Date,
  ): Promise<Record<string, unknown>[]> {
    return this.businessModel
      .find({
        'subscription.startDate': { $gte: from, $lte: to },
        deletedAt: null,
      })
      .select(
        'name subscription.plan subscription.status subscription.startDate subscription.endDate createdAt',
      )
      .sort({ 'subscription.startDate': -1 })
      .lean<Record<string, unknown>[]>()
      .exec();
  }

  async fetchAiUsageData(
    from: Date,
    to: Date,
  ): Promise<Record<string, unknown>[]> {
    // AI-related activity tracked in activity logs
    return this.activityLogModel
      .find({
        createdAt: { $gte: from, $lte: to },
        category: { $in: ['website', 'ai'] },
      })
      .select('actorName action category target createdAt')
      .sort({ createdAt: -1 })
      .lean<Record<string, unknown>[]>()
      .exec();
  }
}
