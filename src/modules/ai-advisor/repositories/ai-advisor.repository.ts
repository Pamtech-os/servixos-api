import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { Client } from '../../clients/schemas/client.schema';
import { Job, JobStatus } from '../../jobs/schemas/job.schema';
import { Payment } from '../../payments/schemas/payment.schema';
import { Review } from '../../reviews/schemas/review.schema';
import type {
  ClientGrowth,
  ReviewStats,
  TopClientBySpend,
} from '../types/ai-advisor.types';

/**
 * Read-only aggregation repository for the AI Advisor module.
 *
 * Only covers metrics not already exposed by AiInsightsRepository (which is
 * reused directly for pricing/operations metrics — unpaid invoices, project
 * value trend, revenue, job completion, scheduling clusters). Same
 * self-contained-model pattern as AnalyticsRepository/AiInsightsRepository.
 */
@Injectable()
export class AiAdvisorRepository {
  private readonly clientModel: ReturnModelType<typeof Client>;
  private readonly jobModel: ReturnModelType<typeof Job>;
  private readonly paymentModel: ReturnModelType<typeof Payment>;
  private readonly reviewModel: ReturnModelType<typeof Review>;

  constructor(@InjectConnection() connection: Connection) {
    this.clientModel = getModelForClass(Client, {
      existingConnection: connection,
    });
    this.jobModel = getModelForClass(Job, { existingConnection: connection });
    this.paymentModel = getModelForClass(Payment, {
      existingConnection: connection,
    });
    this.reviewModel = getModelForClass(Review, {
      existingConnection: connection,
    });
  }

  /** Counts non-deleted jobs currently in progress. */
  async countJobsInProgress(businessId: Types.ObjectId): Promise<number> {
    return this.jobModel.countDocuments({
      businessId,
      deletedAt: null,
      status: JobStatus.IN_PROGRESS,
    });
  }

  /** Returns the review count and average rating for the business. */
  async getReviewStats(businessId: Types.ObjectId): Promise<ReviewStats> {
    const [row] = await this.reviewModel.aggregate<ReviewStats>([
      { $match: { businessId } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          averageRating: { $avg: '$rating' },
        },
      },
      {
        $project: {
          _id: 0,
          count: 1,
          averageRating: { $round: ['$averageRating', 1] },
        },
      },
    ]);

    return row ?? { count: 0, averageRating: 0 };
  }

  /**
   * Counts new (non-deleted) clients created this calendar month vs last
   * calendar month (UTC), used as a marketing growth signal.
   */
  async getClientGrowth(businessId: Types.ObjectId): Promise<ClientGrowth> {
    const now = new Date();
    const startOfThisMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const startOfLastMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );

    const [row] = await this.clientModel.aggregate<ClientGrowth>([
      {
        $match: {
          businessId,
          deletedAt: null,
          createdAt: { $gte: startOfLastMonth },
        },
      },
      {
        $group: {
          _id: null,
          newThisMonth: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', startOfThisMonth] }, 1, 0],
            },
          },
          newLastMonth: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$createdAt', startOfLastMonth] },
                    { $lt: ['$createdAt', startOfThisMonth] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $project: { _id: 0, newThisMonth: 1, newLastMonth: 1 } },
    ]);

    return row ?? { newThisMonth: 0, newLastMonth: 0 };
  }

  /** Returns the top client by total payment spend (empty array if none). */
  async getTopClientsBySpend(
    businessId: Types.ObjectId,
    limit: number,
  ): Promise<TopClientBySpend[]> {
    return this.paymentModel.aggregate<TopClientBySpend>([
      {
        $match: {
          businessId,
          deletedAt: null,
          clientId: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: '$clientId', totalSpent: { $sum: '$amount' } } },
      { $sort: { totalSpent: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'clients',
          let: { clientId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$clientId'] },
                deletedAt: null,
              },
            },
          ],
          as: 'clientInfo',
        },
      },
      { $unwind: { path: '$clientInfo', preserveNullAndEmptyArrays: false } },
      {
        $project: {
          _id: 0,
          name: '$clientInfo.name',
          totalSpent: { $round: ['$totalSpent', 2] },
        },
      },
    ]);
  }
}
