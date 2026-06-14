import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Business } from '../../business/schemas/business.schema';
import { Payment } from '../../payments/schemas/payment.schema';
import { ActivityLog } from '../../activity-logs/schemas/activity-log.schema';

interface MonthlyRevenueBucket {
  year: number;
  month: number;
  total: number;
}

interface MonthlyCountBucket {
  year: number;
  month: number;
  count: number;
}

export interface DailyRevenueBucket {
  year: number;
  month: number;
  day: number;
  total: number;
}

export interface DailyCountBucket {
  year: number;
  month: number;
  day: number;
  count: number;
}

export interface RecentActivityItem {
  action: string;
  category: string;
  actorName: string;
  createdAt: Date;
}

@Injectable()
export class AdminDashboardRepository {
  private readonly userModel: ReturnModelType<typeof User>;
  private readonly businessModel: ReturnModelType<typeof Business>;
  private readonly paymentModel: ReturnModelType<typeof Payment>;
  private readonly activityLogModel: ReturnModelType<typeof ActivityLog>;

  constructor(@InjectConnection() connection: Connection) {
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

  /** Count users. Pass `from` to restrict to registrations within a period. */
  async countTotalUsers(from?: Date): Promise<number> {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (from) filter.createdAt = { $gte: from };
    return this.userModel.countDocuments(filter).exec();
  }

  /** Count businesses. Pass `from` to restrict to registrations within a period. */
  async countActiveBusinesses(from?: Date): Promise<number> {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (from) filter.createdAt = { $gte: from };
    return this.businessModel.countDocuments(filter).exec();
  }

  /** Sum payment amounts between `from` and `to`. */
  async sumRevenue(from: Date, to: Date): Promise<number> {
    const result = await this.paymentModel
      .aggregate<{ total: number }>([
        {
          $match: {
            paymentDate: { $gte: from, $lte: to },
            deletedAt: null,
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .exec();
    return result[0]?.total ?? 0;
  }

  /** Revenue grouped by month for the last N months (default chart). */
  async revenueByMonth(months: number): Promise<MonthlyRevenueBucket[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    return this.paymentModel
      .aggregate<MonthlyRevenueBucket>([
        { $match: { paymentDate: { $gte: since }, deletedAt: null } },
        {
          $group: {
            _id: {
              year: { $year: '$paymentDate' },
              month: { $month: '$paymentDate' },
            },
            total: { $sum: '$amount' },
          },
        },
        {
          $project: {
            _id: 0,
            year: '$_id.year',
            month: '$_id.month',
            total: 1,
          },
        },
        { $sort: { year: 1, month: 1 } },
      ])
      .exec();
  }

  /** Revenue grouped by day within an explicit date range (filtered chart). */
  async revenueByDay(from: Date, to: Date): Promise<DailyRevenueBucket[]> {
    return this.paymentModel
      .aggregate<DailyRevenueBucket>([
        {
          $match: {
            paymentDate: { $gte: from, $lte: to },
            deletedAt: null,
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$paymentDate' },
              month: { $month: '$paymentDate' },
              day: { $dayOfMonth: '$paymentDate' },
            },
            total: { $sum: '$amount' },
          },
        },
        {
          $project: {
            _id: 0,
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day',
            total: 1,
          },
        },
        { $sort: { year: 1, month: 1, day: 1 } },
      ])
      .exec();
  }

  /** New business registrations grouped by month for the last N months (default chart). */
  async businessCountByMonth(months: number): Promise<MonthlyCountBucket[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    return this.businessModel
      .aggregate<MonthlyCountBucket>([
        { $match: { createdAt: { $gte: since }, deletedAt: null } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            year: '$_id.year',
            month: '$_id.month',
            count: 1,
          },
        },
        { $sort: { year: 1, month: 1 } },
      ])
      .exec();
  }

  /** New business registrations grouped by day within an explicit date range (filtered chart). */
  async businessCountByDay(from: Date, to: Date): Promise<DailyCountBucket[]> {
    return this.businessModel
      .aggregate<DailyCountBucket>([
        {
          $match: {
            createdAt: { $gte: from, $lte: to },
            deletedAt: null,
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day',
            count: 1,
          },
        },
        { $sort: { year: 1, month: 1, day: 1 } },
      ])
      .exec();
  }

  async findRecentActivities(
    limit: number,
    from?: Date,
  ): Promise<RecentActivityItem[]> {
    const filter: Record<string, unknown> = {};
    if (from) filter.createdAt = { $gte: from };
    return this.activityLogModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select({ action: 1, category: 1, actorName: 1, createdAt: 1 })
      .lean<RecentActivityItem[]>()
      .exec();
  }
}
