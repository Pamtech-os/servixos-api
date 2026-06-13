import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import {
  Business,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../business/schemas/business.schema';
import { Payment } from '../../payments/schemas/payment.schema';
import { PlanChange } from '../schemas/plan-change.schema';

export interface PlanDistributionItem {
  plan: string;
  count: number;
  percentage: number;
}

export interface RecentPlanChangeItem {
  businessName: string;
  fromPlan: string;
  toPlan: string;
  type: string;
  createdAt: Date;
}

export interface SubscriptionStats {
  mrr: number;
  mrrGrowthPercent: number;
  paidSubscribers: number;
  newPaidSubscribersThisMonth: number;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

@Injectable()
export class AdminSubscriptionsRepository {
  private readonly businessModel: ReturnModelType<typeof Business>;
  private readonly paymentModel: ReturnModelType<typeof Payment>;
  private readonly planChangeModel: ReturnModelType<typeof PlanChange>;

  constructor(@InjectConnection() connection: Connection) {
    this.businessModel = getModelForClass(Business, {
      existingConnection: connection,
    });
    this.paymentModel = getModelForClass(Payment, {
      existingConnection: connection,
    });
    this.planChangeModel = getModelForClass(PlanChange, {
      existingConnection: connection,
    });
  }

  async getStats(): Promise<SubscriptionStats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [mrrResult, lastMrrResult, paidCount, newPaidResult] =
      await Promise.all([
        // Current month revenue
        this.paymentModel
          .aggregate<{
            total: number;
          }>([
            {
              $match: { paymentDate: { $gte: startOfMonth }, deletedAt: null },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ])
          .exec(),
        // Previous month revenue (for growth %)
        this.paymentModel
          .aggregate<{ total: number }>([
            {
              $match: {
                paymentDate: { $gte: startOfLastMonth, $lt: startOfMonth },
                deletedAt: null,
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ])
          .exec(),
        // Businesses with active paid subscription
        this.businessModel
          .countDocuments({
            deletedAt: null,
            isSuspended: false,
            'subscription.status': SubscriptionStatus.ACTIVE,
          })
          .exec(),
        // New paid subscribers this month (became ACTIVE this month)
        this.planChangeModel
          .countDocuments({ createdAt: { $gte: startOfMonth } })
          .exec(),
      ]);

    const mrr = mrrResult[0]?.total ?? 0;
    const lastMrr = lastMrrResult[0]?.total ?? 0;
    const mrrGrowthPercent =
      lastMrr === 0 ? 0 : Math.round(((mrr - lastMrr) / lastMrr) * 1000) / 10;

    return {
      mrr,
      mrrGrowthPercent,
      paidSubscribers: paidCount,
      newPaidSubscribersThisMonth: newPaidResult,
    };
  }

  /** MRR bar chart data for the last N months, filled for missing months. */
  async getMrrHistory(
    months: number,
  ): Promise<{ label: string; value: number }[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const buckets = await this.paymentModel
      .aggregate<{ year: number; month: number; total: number }>([
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
      ])
      .exec();

    // Hash map for O(1) lookup
    const byKey = new Map(
      buckets.map((b) => [`${b.year}-${b.month}`, b.total]),
    );
    const now = new Date();

    return Array.from({ length: months }, (_, i) => {
      const d = new Date(
        now.getFullYear(),
        now.getMonth() - (months - 1 - i),
        1,
      );
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      return { label: MONTH_LABELS[d.getMonth()], value: byKey.get(key) ?? 0 };
    });
  }

  /** Subscriber count broken down by subscription plan with percentages. */
  async getPlanDistribution(): Promise<PlanDistributionItem[]> {
    const results = await this.businessModel
      .aggregate<{ plan: string; count: number }>([
        {
          $match: {
            deletedAt: null,
            isSuspended: false,
            'subscription.status': {
              $in: [
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.TRIALING,
                SubscriptionStatus.GRACE_PERIOD,
              ],
            },
          },
        },
        { $group: { _id: '$subscription.plan', count: { $sum: 1 } } },
        { $project: { plan: '$_id', count: 1, _id: 0 } },
      ])
      .exec();

    const total = results.reduce((sum, r) => sum + r.count, 0);

    // Fill in all plans even if count is 0
    const byPlan = new Map(results.map((r) => [r.plan, r.count]));
    const plans = [
      SubscriptionPlan.STARTER,
      SubscriptionPlan.GROWTH,
      SubscriptionPlan.PRO,
    ];

    return plans.map((plan) => {
      const count = byPlan.get(plan) ?? 0;
      const percentage =
        total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
      return { plan, count, percentage };
    });
  }

  /** Most recent plan changes recorded in the plan_changes collection. */
  async getRecentPlanChanges(limit: number): Promise<RecentPlanChangeItem[]> {
    return this.planChangeModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select({
        businessName: 1,
        fromPlan: 1,
        toPlan: 1,
        type: 1,
        createdAt: 1,
      })
      .lean<RecentPlanChangeItem[]>()
      .exec();
  }

  /** Record a plan change event — call this whenever a business's plan changes. */
  async recordPlanChange(data: {
    businessId: string;
    businessName: string;
    fromPlan: string;
    toPlan: string;
    type: string;
  }): Promise<void> {
    await this.planChangeModel.create([
      {
        businessId: new Types.ObjectId(data.businessId),
        businessName: data.businessName,
        fromPlan: data.fromPlan,
        toPlan: data.toPlan,
        type: data.type,
      },
    ]);
  }
}
