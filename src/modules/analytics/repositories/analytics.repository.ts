import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { ActivityLog } from '../../activity-logs/schemas/activity-log.schema';
import { Invoice, InvoiceStatus } from '../../invoices/schemas/invoice.schema';
import { Job, JobStatus } from '../../jobs/schemas/job.schema';
import { Payment } from '../../payments/schemas/payment.schema';
import { ServiceRequest } from '../../requests/schemas/service-request.schema';
import { Review } from '../../reviews/schemas/review.schema';
import { PageView } from '../schemas/page-view.schema';
import type {
  RawActivityLog,
  RawJobStatusRow,
  RawRevenueRow,
  RawTopClient,
  RawTopPage,
  RawTrafficRow,
} from '../types/analytics.types';

/**
 * Read-only aggregation repository for the analytics module.
 *
 * All methods scope queries to a single `businessId` and return plain
 * JavaScript objects (via `.lean()`). No business logic lives here — the
 * service layer is responsible for defaults, caching, and response shaping.
 *
 * MongoDB aggregate pipelines follow these conventions:
 *  - Stage 1: `$match` with index-covered fields first (businessId, timestamp/paymentDate)
 *  - Stage 2+: `$group`, `$sort`, `$project`, `$lookup` as needed
 *  - `$round` applied to monetary values to avoid floating-point noise
 */
@Injectable()
export class AnalyticsRepository {
  private readonly pageViewModel: ReturnModelType<typeof PageView>;
  private readonly paymentModel: ReturnModelType<typeof Payment>;
  private readonly jobModel: ReturnModelType<typeof Job>;
  private readonly invoiceModel: ReturnModelType<typeof Invoice>;
  private readonly activityLogModel: ReturnModelType<typeof ActivityLog>;
  private readonly serviceRequestModel: ReturnModelType<typeof ServiceRequest>;
  private readonly reviewModel: ReturnModelType<typeof Review>;

  constructor(@InjectConnection() connection: Connection) {
    this.pageViewModel = getModelForClass(PageView, {
      existingConnection: connection,
    });
    this.paymentModel = getModelForClass(Payment, {
      existingConnection: connection,
    });
    this.jobModel = getModelForClass(Job, { existingConnection: connection });
    this.invoiceModel = getModelForClass(Invoice, {
      existingConnection: connection,
    });
    this.activityLogModel = getModelForClass(ActivityLog, {
      existingConnection: connection,
    });
    this.serviceRequestModel = getModelForClass(ServiceRequest, {
      existingConnection: connection,
    });
    this.reviewModel = getModelForClass(Review, {
      existingConnection: connection,
    });
  }

  // ─── Traffic ────────────────────────────────────────────────────────────────

  /**
   * Returns daily traffic data grouped by business-local date.
   *
   * Two-pass $group pattern:
   *  Pass 1: group by (date, sessionId) to deduplicate sessions within a day.
   *  Pass 2: group by date to sum page views and count unique sessions.
   *
   * Example result:
   *   [{ date: "2026-04-08", pageViews: 130, visitors: 42 }, ...]
   */
  async getTrafficData(
    businessId: Types.ObjectId,
    dateFrom: Date,
    dateTo: Date,
    timezone: string,
  ): Promise<RawTrafficRow[]> {
    return this.pageViewModel.aggregate<RawTrafficRow>([
      {
        $match: { businessId, timestamp: { $gte: dateFrom, $lte: dateTo } },
      },
      {
        $addFields: {
          dateStr: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone },
          },
        },
      },
      // Pass 1 — deduplicate (date, sessionId) pairs, preserve total page views
      {
        $group: {
          _id: { date: '$dateStr', sessionId: '$sessionId' },
          sessionPageViews: { $sum: 1 },
        },
      },
      // Pass 2 — aggregate per date: sum page views, count distinct sessions
      {
        $group: {
          _id: '$_id.date',
          pageViews: { $sum: '$sessionPageViews' },
          visitors: {
            // Only count sessions that carried a sessionId (non-null)
            $sum: { $cond: [{ $ne: ['$_id.sessionId', null] }, 1, 0] },
          },
        },
      },
      {
        $project: { _id: 0, date: '$_id', pageViews: 1, visitors: 1 },
      },
      { $sort: { date: 1 } },
    ]);
  }

  /**
   * Returns the top pages by view count for the given period (max 10).
   *
   * Example result:
   *   [{ page: "/", views: 400 }, { page: "/services", views: 200 }, ...]
   */
  async getTopPages(
    businessId: Types.ObjectId,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<RawTopPage[]> {
    return this.pageViewModel.aggregate<RawTopPage>([
      {
        $match: { businessId, timestamp: { $gte: dateFrom, $lte: dateTo } },
      },
      { $group: { _id: '$page', views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, page: '$_id', views: 1 } },
    ]);
  }

  /**
   * Counts total page view documents in the given period.
   * Used to derive the `dailyAverage` traffic stat.
   */
  async countTotalPageViews(
    businessId: Types.ObjectId,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<number> {
    return this.pageViewModel.countDocuments({
      businessId,
      timestamp: { $gte: dateFrom, $lte: dateTo },
    });
  }

  /**
   * Counts service requests submitted in the period.
   * Used to compute the traffic conversion rate.
   */
  async countServiceRequestsInPeriod(
    businessId: Types.ObjectId,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<number> {
    return this.serviceRequestModel.countDocuments({
      businessId,
      createdAt: { $gte: dateFrom, $lte: dateTo },
    });
  }

  // ─── Revenue ─────────────────────────────────────────────────────────────────

  /**
   * Aggregates payments by calendar month in the business's local timezone,
   * starting from `startDate` (inclusive) through the current month.
   *
   * Example result:
   *   [{ month: "2026-03", revenue: 5200.00, count: 14 }, ...]
   */
  async getRevenueByMonth(
    businessId: Types.ObjectId,
    startDate: Date,
    timezone: string,
  ): Promise<RawRevenueRow[]> {
    return this.paymentModel.aggregate<RawRevenueRow>([
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
            $dateToString: { format: '%Y-%m', date: '$paymentDate', timezone },
          },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          month: '$_id',
          revenue: { $round: ['$revenue', 2] },
          count: 1,
        },
      },
    ]);
  }

  // ─── Jobs ─────────────────────────────────────────────────────────────────

  /**
   * Returns the count of non-deleted jobs grouped by status.
   *
   * Example result:
   *   [{ status: "pending", count: 12 }, { status: "completed", count: 87 }, ...]
   */
  async getJobStatusDistribution(
    businessId: Types.ObjectId,
  ): Promise<RawJobStatusRow[]> {
    return this.jobModel.aggregate<RawJobStatusRow>([
      { $match: { businessId, deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]);
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  /**
   * Sums payment amounts for the current UTC calendar month.
   * Filters by UTC month boundaries — acceptable for a cached dashboard figure.
   */
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
   * Counts distinct clients that have at least one active (non-completed,
   * non-cancelled) job.
   *
   * Two-stage aggregate: group by clientId → count distinct groups.
   */
  async countActiveClients(businessId: Types.ObjectId): Promise<number> {
    const [row] = await this.jobModel.aggregate<{ count: number }>([
      {
        $match: {
          businessId,
          status: { $nin: [JobStatus.COMPLETED, JobStatus.CANCELLED] },
          deletedAt: null,
        },
      },
      { $group: { _id: '$clientId' } },
      { $count: 'count' },
    ]);

    return row?.count ?? 0;
  }

  /**
   * Counts and sums the outstanding balance on pending/partial invoices.
   * Outstanding balance = totalAmount - amountPaid per invoice.
   */
  async getOutstandingInvoices(
    businessId: Types.ObjectId,
  ): Promise<{ count: number; totalAmount: number }> {
    const [row] = await this.invoiceModel.aggregate<{
      count: number;
      totalAmount: number;
    }>([
      {
        $match: {
          businessId,
          status: { $in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: {
            $sum: { $subtract: ['$totalAmount', '$amountPaid'] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          count: 1,
          totalAmount: { $round: ['$totalAmount', 2] },
        },
      },
    ]);

    return { count: row?.count ?? 0, totalAmount: row?.totalAmount ?? 0 };
  }

  /**
   * Returns the `limit` most recent activity log entries for the business,
   * projecting only fields safe for API exposure.
   */
  async getRecentActivity(
    businessId: Types.ObjectId,
    limit: number,
  ): Promise<RawActivityLog[]> {
    return this.activityLogModel
      .find({ businessId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('_id actorName actorRole action category timestamp createdAt')
      .lean<RawActivityLog[]>()
      .exec();
  }

  /**
   * Returns the top `limit` clients ranked by their total payment spend.
   *
   * Pipeline: group payments by clientId → sort descending → lookup client
   * document → unwind (skips deleted clients) → project safe fields.
   *
   * Uses O(n log n) sort on the aggregated payment groups, not the full
   * payment collection, so cost scales with distinct-client count.
   */
  async getTopClientsBySpend(
    businessId: Types.ObjectId,
    limit: number,
  ): Promise<RawTopClient[]> {
    return this.paymentModel.aggregate<RawTopClient>([
      {
        $match: {
          businessId,
          deletedAt: null,
          clientId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$clientId',
          totalSpent: { $sum: '$amount' },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'clients',
          localField: '_id',
          foreignField: '_id',
          as: 'clientInfo',
        },
      },
      // Skip payments whose client record was soft-deleted (empty lookup result)
      { $unwind: { path: '$clientInfo', preserveNullAndEmptyArrays: false } },
      {
        $match: { 'clientInfo.deletedAt': null },
      },
      {
        $project: {
          _id: 0,
          clientId: '$_id',
          name: '$clientInfo.name',
          email: '$clientInfo.email',
          totalSpent: { $round: ['$totalSpent', 2] },
        },
      },
    ]);
  }

  /** Counts all reviews submitted for the business. */
  async countReviews(businessId: Types.ObjectId): Promise<number> {
    return this.reviewModel.countDocuments({ businessId }).exec();
  }
}
