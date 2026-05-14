import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { ANALYTICS_MESSAGES } from 'src/common/constants/messages/analytics.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { toTwoDecimal } from 'src/common/utils/number.util';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { RedisService } from '../../redis/services/redis.service';
import { AnalyticsRepository } from '../repositories/analytics.repository';
import { TrafficQueryDto } from '../dto/traffic-query.dto';
import { RevenueQueryDto } from '../dto/revenue-query.dto';
import { JobStatus } from '../../jobs/schemas/job.schema';
import type {
  DashboardStats,
  JobStatusPoint,
  MonthlyRevenuePoint,
  TopPage,
  TrafficAnalytics,
} from '../types/analytics.types';

const DEFAULT_TRAFFIC_DAYS = 7;
const DEFAULT_REVENUE_MONTHS = 7;
const DASHBOARD_ACTIVITY_LIMIT = 5;
const TOP_CLIENTS_LIMIT = 5;

/** All four job statuses that should always appear in the chart */
const ALL_JOB_STATUSES = [
  JobStatus.PENDING,
  JobStatus.IN_PROGRESS,
  JobStatus.COMPLETED,
  JobStatus.CANCELLED,
];

// ─── Cache key builders ────────────────────────────────────────────────────────

const trafficCacheKey = (
  businessId: string,
  dateFrom: string,
  dateTo: string,
): string => `${businessId}:analytics:traffic:${dateFrom}:${dateTo}`;

const revenueCacheKey = (businessId: string, months: number): string =>
  `${businessId}:analytics:revenue:${months}`;

const jobsCacheKey = (businessId: string): string =>
  `${businessId}:analytics:jobs`;

const dashboardCacheKey = (businessId: string): string =>
  `${businessId}:analytics:dashboard`;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Returns website traffic analytics for the given date range.
   *
   * Defaults: dateFrom = 7 days ago, dateTo = today.
   * Dates are parsed as start-of-day and end-of-day UTC respectively.
   *
   * Cache key: {businessId}:analytics:traffic:{dateFrom}:{dateTo}
   * TTL: CACHE_TTL.ANALYTICS_TRAFFIC (10 minutes)
   *
   * Example:
   *   getTrafficAnalytics("biz123", { dateFrom: "2026-04-01", dateTo: "2026-04-30" })
   *   → { trafficData: [...], topPages: [...], stats: { ... } }
   */
  async getTrafficAnalytics(
    businessId: string,
    dto: TrafficQueryDto,
  ): Promise<
    TrafficAnalytics | NotFoundException | InternalServerErrorException
  > {
    const { dateFrom: fromStr, dateTo: toStr } =
      this.resolveTrafficDateRange(dto);
    const cacheKey = trafficCacheKey(businessId, fromStr, toStr);

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as TrafficAnalytics;

      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const bId = new Types.ObjectId(businessId);
      const dateFrom = new Date(`${fromStr}T00:00:00.000Z`);
      const dateTo = new Date(`${toStr}T23:59:59.999Z`);
      const timezone = business.timezone ?? 'UTC';

      // Run all three traffic queries in parallel for low latency
      const [trafficRows, topPageRows, totalPageViews, requestCount] =
        await Promise.all([
          this.analyticsRepository.getTrafficData(
            bId,
            dateFrom,
            dateTo,
            timezone,
          ),
          this.analyticsRepository.getTopPages(bId, dateFrom, dateTo),
          this.analyticsRepository.countTotalPageViews(bId, dateFrom, dateTo),
          this.analyticsRepository.countServiceRequestsInPeriod(
            bId,
            dateFrom,
            dateTo,
          ),
        ]);

      const totalVisitors = trafficRows.reduce((sum, r) => sum + r.visitors, 0);
      const dayCount = this.daysBetween(dateFrom, dateTo);
      const dailyAverage =
        dayCount > 0 ? toTwoDecimal(totalPageViews / dayCount) : 0;
      const conversionRate =
        totalVisitors > 0
          ? toTwoDecimal((requestCount / totalVisitors) * 100)
          : 0;

      const topPages: TopPage[] = topPageRows.map((r) => ({
        page: r.page,
        views: r.views,
        percentage:
          totalPageViews > 0
            ? toTwoDecimal((r.views / totalPageViews) * 100)
            : 0,
      }));

      const result: TrafficAnalytics = {
        trafficData: trafficRows,
        topPages,
        stats: {
          totalVisitors,
          totalPageViews,
          dailyAverage,
          conversionRate,
        },
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.ANALYTICS_TRAFFIC)
        .catch((err: unknown) =>
          this.logger.warn(
            `getTrafficAnalytics: cache write failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return result;
    } catch (error) {
      this.logger.error(
        `getTrafficAnalytics: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        ANALYTICS_MESSAGES.ERROR.RETRIEVAL_FAILED,
      );
    }
  }

  /**
   * Returns monthly revenue aggregated over the last N months (default 7).
   *
   * Months with zero revenue are filled in so the chart always has a
   * continuous series from the earliest month to the current month.
   *
   * Cache key: {businessId}:analytics:revenue:{months}
   * TTL: CACHE_TTL.REVENUE_CHART (10 minutes)
   *
   * Example:
   *   getRevenueChart("biz123", { months: 6 })
   *   → [{ month: "2026-01", revenue: 3200.00, count: 8 }, ...]
   */
  async getRevenueChart(
    businessId: string,
    dto: RevenueQueryDto,
  ): Promise<
    MonthlyRevenuePoint[] | NotFoundException | InternalServerErrorException
  > {
    const months = dto.months ?? DEFAULT_REVENUE_MONTHS;
    const cacheKey = revenueCacheKey(businessId, months);

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as MonthlyRevenuePoint[];

      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const bId = new Types.ObjectId(businessId);
      const timezone = business.timezone ?? 'UTC';
      const startDate = this.monthStartNMonthsAgo(months);

      const rawRows = await this.analyticsRepository.getRevenueByMonth(
        bId,
        startDate,
        timezone,
      );

      // Hash map for O(1) lookups when filling zero-revenue months
      const rowMap = new Map(rawRows.map((r) => [r.month, r]));
      const allMonths = this.generateMonthKeys(startDate, new Date());

      const result: MonthlyRevenuePoint[] = allMonths.map(
        (month) => rowMap.get(month) ?? { month, revenue: 0, count: 0 },
      );

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.REVENUE_CHART)
        .catch((err: unknown) =>
          this.logger.warn(
            `getRevenueChart: cache write failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return result;
    } catch (error) {
      this.logger.error(
        `getRevenueChart: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        ANALYTICS_MESSAGES.ERROR.RETRIEVAL_FAILED,
      );
    }
  }

  /**
   * Returns the distribution of jobs across all four statuses as percentages.
   *
   * All four statuses are always returned (even with count=0) so the chart
   * always has a complete series.
   *
   * Cache key: {businessId}:analytics:jobs
   * TTL: CACHE_TTL.JOB_STATUS_CHART (5 minutes)
   *
   * Example:
   *   getJobsAnalytics("biz123")
   *   → [{ status: "pending", count: 12, percentage: 14.3 }, ...]
   */
  async getJobsAnalytics(
    businessId: string,
  ): Promise<JobStatusPoint[] | InternalServerErrorException> {
    const cacheKey = jobsCacheKey(businessId);

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as JobStatusPoint[];

      const rows = await this.analyticsRepository.getJobStatusDistribution(
        new Types.ObjectId(businessId),
      );

      // Hash map for O(1) lookups when filling zero-count statuses
      const rowMap = new Map(rows.map((r) => [r.status, r.count]));
      const totalJobs = rows.reduce((sum, r) => sum + r.count, 0);

      const result: JobStatusPoint[] = ALL_JOB_STATUSES.map((status) => {
        const count = rowMap.get(status) ?? 0;
        return {
          status,
          count,
          percentage:
            totalJobs > 0 ? toTwoDecimal((count / totalJobs) * 100) : 0,
        };
      });

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.JOB_STATUS_CHART)
        .catch((err: unknown) =>
          this.logger.warn(
            `getJobsAnalytics: cache write failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return result;
    } catch (error) {
      this.logger.error(
        `getJobsAnalytics: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        ANALYTICS_MESSAGES.ERROR.RETRIEVAL_FAILED,
      );
    }
  }

  /**
   * Returns aggregated dashboard statistics in a single request.
   *
   * All sub-queries run in parallel (Promise.all) to minimise response time.
   *
   * Cache key: {businessId}:analytics:dashboard
   * TTL: CACHE_TTL.DASHBOARD_STATS (5 minutes)
   *
   * Example:
   *   getDashboard("biz123")
   *   → { monthlyRevenue: 12400, activeClientsCount: 23, ... }
   */
  async getDashboard(
    businessId: string,
  ): Promise<DashboardStats | InternalServerErrorException> {
    const cacheKey = dashboardCacheKey(businessId);

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as DashboardStats;

      const bId = new Types.ObjectId(businessId);

      // All five aggregations run concurrently — network/IO bound not CPU bound
      const [
        monthlyRevenue,
        activeClientsCount,
        outstandingInvoices,
        recentActivityRaw,
        topClientsRaw,
      ] = await Promise.all([
        this.analyticsRepository.getCurrentMonthRevenue(bId),
        this.analyticsRepository.countActiveClients(bId),
        this.analyticsRepository.getOutstandingInvoices(bId),
        this.analyticsRepository.getRecentActivity(
          bId,
          DASHBOARD_ACTIVITY_LIMIT,
        ),
        this.analyticsRepository.getTopClientsBySpend(bId, TOP_CLIENTS_LIMIT),
      ]);

      const result: DashboardStats = {
        monthlyRevenue: toTwoDecimal(monthlyRevenue),
        activeClientsCount,
        outstandingInvoices: {
          count: outstandingInvoices.count,
          totalAmount: toTwoDecimal(outstandingInvoices.totalAmount),
        },
        reviewCount: 0, // placeholder until the reviews module is built
        recentActivity: recentActivityRaw.map((log) => ({
          id: log._id.toString(),
          actorName: log.actorName,
          actorRole: log.actorRole,
          action: log.action,
          category: log.category,
          timestamp: log.timestamp ?? log.createdAt ?? new Date(),
        })),
        topClients: topClientsRaw.map((c) => ({
          clientId: c.clientId.toString(),
          name: c.name,
          email: c.email,
          totalSpent: toTwoDecimal(c.totalSpent),
        })),
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.DASHBOARD_STATS)
        .catch((err: unknown) =>
          this.logger.warn(
            `getDashboard: cache write failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return result;
    } catch (error) {
      this.logger.error(
        `getDashboard: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        ANALYTICS_MESSAGES.ERROR.RETRIEVAL_FAILED,
      );
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Resolves dateFrom/dateTo strings with default fallbacks.
   * Returns ISO date strings (YYYY-MM-DD) for cache-key stability.
   */
  private resolveTrafficDateRange(dto: TrafficQueryDto): {
    dateFrom: string;
    dateTo: string;
  } {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setUTCDate(today.getUTCDate() - (DEFAULT_TRAFFIC_DAYS - 1));

    const dateTo = dto.dateTo ?? this.toIsoDate(today);
    const dateFrom = dto.dateFrom ?? this.toIsoDate(sevenDaysAgo);

    return { dateFrom, dateTo };
  }

  /** Formats a Date as YYYY-MM-DD using UTC parts */
  private toIsoDate(d: Date): string {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /** Returns the first day of the month N months before the current UTC month */
  private monthStartNMonthsAgo(n: number): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1),
    );
  }

  /**
   * Generates an ordered array of YYYY-MM month keys from `from` (inclusive)
   * to `to` (inclusive), using UTC month arithmetic.
   *
   * Example: monthStartNMonthsAgo(3) → ["2026-02", "2026-03", "2026-04"]
   */
  private generateMonthKeys(from: Date, to: Date): string[] {
    const keys: string[] = [];
    const cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
    );
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

    while (cursor <= end) {
      const yyyy = cursor.getUTCFullYear();
      const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      keys.push(`${yyyy}-${mm}`);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return keys;
  }

  /** Returns the number of whole days between two dates (inclusive) */
  private daysBetween(from: Date, to: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.max(1, Math.round((to.getTime() - from.getTime()) / msPerDay));
  }
}
