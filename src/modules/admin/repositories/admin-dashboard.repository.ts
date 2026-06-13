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

  async countTotalUsers(): Promise<number> {
    return this.userModel.countDocuments({ deletedAt: null }).exec();
  }

  async countActiveBusinesses(): Promise<number> {
    return this.businessModel.countDocuments({ deletedAt: null }).exec();
  }

  async sumMonthlyRevenue(): Promise<number> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const result = await this.paymentModel
      .aggregate<{
        total: number;
      }>([
        { $match: { paymentDate: { $gte: start }, deletedAt: null } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .exec();
    return result[0]?.total ?? 0;
  }

  /** Revenue grouped by month for the last N months. */
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

  /** New business registrations grouped by month for the last N months. */
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

  async findRecentActivities(limit: number): Promise<RecentActivityItem[]> {
    return this.activityLogModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select({ action: 1, category: 1, actorName: 1, createdAt: 1 })
      .lean<RecentActivityItem[]>()
      .exec();
  }
}
