import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { Client } from '../../clients/schemas/client.schema';
import {
  Contract,
  ContractStatus,
} from '../../contracts/schemas/contract.schema';
import { Invoice, InvoiceStatus } from '../../invoices/schemas/invoice.schema';
import { Job, JobStatus } from '../../jobs/schemas/job.schema';
import { Payment } from '../../payments/schemas/payment.schema';
import type {
  JobCompletionStats,
  MonthlyRevenuePoint,
  PendingContractSummary,
  ProjectValueWindows,
  SchedulingClusterCandidate,
  UnpaidInvoicesSummary,
} from '../types/ai-insights.types';

const MIN_SCHEDULING_CLUSTER_SIZE = 3;

/**
 * Read-only aggregation repository for the AI Insights module.
 *
 * Mirrors the AnalyticsRepository pattern: models are instantiated directly
 * from the shared Mongoose connection so this module stays self-contained
 * without importing every upstream module. No business logic lives here —
 * the service layer owns thresholds, severity, and copy.
 */
@Injectable()
export class AiInsightsRepository {
  private readonly clientModel: ReturnModelType<typeof Client>;
  private readonly contractModel: ReturnModelType<typeof Contract>;
  private readonly invoiceModel: ReturnModelType<typeof Invoice>;
  private readonly jobModel: ReturnModelType<typeof Job>;
  private readonly paymentModel: ReturnModelType<typeof Payment>;

  constructor(@InjectConnection() connection: Connection) {
    this.clientModel = getModelForClass(Client, {
      existingConnection: connection,
    });
    this.contractModel = getModelForClass(Contract, {
      existingConnection: connection,
    });
    this.invoiceModel = getModelForClass(Invoice, {
      existingConnection: connection,
    });
    this.jobModel = getModelForClass(Job, { existingConnection: connection });
    this.paymentModel = getModelForClass(Payment, {
      existingConnection: connection,
    });
  }

  /**
   * Counts and sums the outstanding balance (totalAmount - amountPaid) across
   * all pending/partial invoices.
   */
  async getUnpaidInvoicesSummary(
    businessId: Types.ObjectId,
  ): Promise<UnpaidInvoicesSummary> {
    const [row] = await this.invoiceModel.aggregate<UnpaidInvoicesSummary>([
      {
        $match: {
          businessId,
          deletedAt: null,
          status: { $in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalOutstanding: {
            $sum: { $subtract: ['$totalAmount', '$amountPaid'] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          count: 1,
          totalOutstanding: { $round: ['$totalOutstanding', 2] },
        },
      },
    ]);

    return row ?? { count: 0, totalOutstanding: 0 };
  }

  /**
   * Compares average invoice value between two rolling windows using a
   * single $facet pass (one collection scan instead of two).
   *
   * Example: currentStart = 90 days ago, previousStart = 180 days ago,
   * previousEnd = 90 days ago → { currentAvg, previousAvg }.
   */
  async getProjectValueWindows(
    businessId: Types.ObjectId,
    currentStart: Date,
    previousStart: Date,
    previousEnd: Date,
  ): Promise<ProjectValueWindows> {
    const [row] = await this.invoiceModel.aggregate<ProjectValueWindows>([
      { $match: { businessId, deletedAt: null } },
      {
        $facet: {
          current: [
            { $match: { invoiceDate: { $gte: currentStart } } },
            { $group: { _id: null, avg: { $avg: '$totalAmount' } } },
          ],
          previous: [
            {
              $match: {
                invoiceDate: { $gte: previousStart, $lt: previousEnd },
              },
            },
            { $group: { _id: null, avg: { $avg: '$totalAmount' } } },
          ],
        },
      },
      {
        $project: {
          currentAvg: {
            $round: [{ $ifNull: [{ $first: '$current.avg' }, 0] }, 2],
          },
          previousAvg: {
            $round: [{ $ifNull: [{ $first: '$previous.avg' }, 0] }, 2],
          },
        },
      },
    ]);

    return row ?? { currentAvg: 0, previousAvg: 0 };
  }

  /**
   * Aggregates completed payments by calendar month (UTC) starting from
   * `startDate`, used to derive a short-term revenue trend.
   */
  async getRecentMonthlyRevenue(
    businessId: Types.ObjectId,
    startDate: Date,
  ): Promise<MonthlyRevenuePoint[]> {
    return this.paymentModel.aggregate<MonthlyRevenuePoint>([
      {
        $match: {
          businessId,
          deletedAt: null,
          paymentDate: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$paymentDate' },
          },
          revenue: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          month: '$_id',
          revenue: { $round: ['$revenue', 2] },
        },
      },
    ]);
  }

  /** Sums completed payment amounts for the current UTC calendar month. */
  async getCurrentMonthRevenue(businessId: Types.ObjectId): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const startOfNextMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    const [row] = await this.paymentModel.aggregate<{ total: number }>([
      {
        $match: {
          businessId,
          deletedAt: null,
          paymentDate: { $gte: startOfMonth, $lt: startOfNextMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return row?.total ?? 0;
  }

  /**
   * Counts clients whose most recently completed job finished before
   * `thresholdDate` and who have had no job created since — i.e. clients
   * that finished work but never came back for more.
   *
   * Two-stage pipeline: group jobs by client to find each client's last
   * completion, then $lookup to check for any newer job for that client.
   */
  async countReengagementClients(
    businessId: Types.ObjectId,
    thresholdDate: Date,
  ): Promise<number> {
    const [row] = await this.jobModel.aggregate<{ count: number }>([
      {
        $match: {
          businessId,
          deletedAt: null,
          status: JobStatus.COMPLETED,
        },
      },
      {
        $group: {
          _id: '$clientId',
          lastCompleted: { $max: '$completedAt' },
        },
      },
      { $match: { lastCompleted: { $lt: thresholdDate } } },
      {
        $lookup: {
          from: 'jobs',
          let: { clientId: '$_id', lastCompleted: '$lastCompleted' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$businessId', businessId] },
                    { $eq: ['$clientId', '$$clientId'] },
                    { $eq: ['$deletedAt', null] },
                    { $gt: ['$createdAt', '$$lastCompleted'] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'newerJobs',
        },
      },
      { $match: { newerJobs: { $size: 0 } } },
      { $count: 'count' },
    ]);

    return row?.count ?? 0;
  }

  /**
   * Returns the highest-value contract that has been sent but not yet
   * signed, cancelled, or expired — the deal most worth following up on.
   */
  async getTopPendingContract(
    businessId: Types.ObjectId,
  ): Promise<PendingContractSummary | null> {
    const now = new Date();
    const [row] = await this.contractModel.aggregate<PendingContractSummary>([
      {
        $match: {
          businessId,
          deletedAt: null,
          status: ContractStatus.SENT,
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: 'clients',
          let: { clientId: '$clientId' },
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
          clientName: '$clientInfo.name',
          amount: 1,
        },
      },
    ]);

    return row ?? null;
  }

  /**
   * Finds a location with at least `MIN_SCHEDULING_CLUSTER_SIZE` upcoming
   * jobs that could be grouped into fewer trips.
   */
  async getSchedulingClusterCandidate(
    businessId: Types.ObjectId,
  ): Promise<SchedulingClusterCandidate | null> {
    const now = new Date();
    const [row] = await this.jobModel.aggregate<SchedulingClusterCandidate>([
      {
        $match: {
          businessId,
          deletedAt: null,
          status: { $in: [JobStatus.PENDING, JobStatus.IN_PROGRESS] },
          scheduledDate: { $gte: now },
          location: { $exists: true, $nin: [null, ''] },
        },
      },
      {
        $group: {
          _id: { $toLower: { $trim: { input: '$location' } } },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: MIN_SCHEDULING_CLUSTER_SIZE } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
      { $project: { _id: 0, location: '$_id', count: 1 } },
    ]);

    return row ?? null;
  }

  /**
   * Counts completed vs. total (non-cancelled) jobs created since
   * `sinceDate`, used to compute a rolling job completion rate.
   */
  async getJobCompletionStats(
    businessId: Types.ObjectId,
    sinceDate: Date,
  ): Promise<JobCompletionStats> {
    const [row] = await this.jobModel.aggregate<JobCompletionStats>([
      {
        $match: {
          businessId,
          deletedAt: null,
          createdAt: { $gte: sinceDate },
          status: { $ne: JobStatus.CANCELLED },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$status', JobStatus.COMPLETED] }, 1, 0],
            },
          },
        },
      },
      { $project: { _id: 0, total: 1, completed: 1 } },
    ]);

    return row ?? { completed: 0, total: 0 };
  }
}
