import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { AdminDashboardRepository } from '../repositories/admin-dashboard.repository';
import type {
  DashboardStats,
  MonthlyDataPoint,
  RecentActivityEntry,
} from '../types/admin.types';

const MONTHS_HISTORY = 6;
const RECENT_ACTIVITIES_LIMIT = 20;

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
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(private readonly dashboardRepository: AdminDashboardRepository) {}

  /** Aggregate all dashboard stats in parallel for efficiency. */
  async getDashboardStats(): Promise<
    DashboardStats | InternalServerErrorException
  > {
    try {
      const [
        totalUsers,
        monthlyRevenue,
        activeBusinesses,
        revenueHistory,
        businessHistory,
      ] = await Promise.all([
        this.dashboardRepository.countTotalUsers(),
        this.dashboardRepository.sumMonthlyRevenue(),
        this.dashboardRepository.countActiveBusinesses(),
        this.dashboardRepository.revenueByMonth(MONTHS_HISTORY),
        this.dashboardRepository.businessCountByMonth(MONTHS_HISTORY),
      ]);

      const revenueDataPoints = this.buildRevenueTimeline(revenueHistory);
      const growthDataPoints = this.buildGrowthTimeline(businessHistory);

      return {
        totalUsers,
        monthlyRevenue,
        activeBusinesses,
        revenueHistory: revenueDataPoints,
        growthHistory: growthDataPoints,
      };
    } catch (error) {
      this.logger.error(
        `getDashboardStats: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Return the most recent platform-wide activity log entries. */
  async getRecentActivities(): Promise<
    RecentActivityEntry[] | InternalServerErrorException
  > {
    try {
      return await this.dashboardRepository.findRecentActivities(
        RECENT_ACTIVITIES_LIMIT,
      );
    } catch (error) {
      this.logger.error(
        `getRecentActivities: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build a contiguous N-month timeline filling missing months with 0.
   * Avoids a second DB round-trip by scanning the sparse aggregate result once — O(n).
   */
  private buildRevenueTimeline(
    buckets: { year: number; month: number; total: number }[],
  ): MonthlyDataPoint[] {
    // Hash map for O(1) lookup by "YYYY-MM" key
    const byKey = new Map(
      buckets.map((b) => [`${b.year}-${b.month}`, b.total]),
    );
    return this.generateMonthSlots(MONTHS_HISTORY).map(
      ({ year, month, label }) => ({
        label,
        value: byKey.get(`${year}-${month}`) ?? 0,
      }),
    );
  }

  /**
   * Compute month-over-month growth % from new business registrations.
   * Growth for month M = (countM - countM-1) / countM-1 * 100, clamped to 0 if no prior data.
   */
  private buildGrowthTimeline(
    buckets: { year: number; month: number; count: number }[],
  ): MonthlyDataPoint[] {
    const byKey = new Map(
      buckets.map((b) => [`${b.year}-${b.month}`, b.count]),
    );
    const slots = this.generateMonthSlots(MONTHS_HISTORY);

    return slots.map(({ year, month, label }, idx) => {
      const current = byKey.get(`${year}-${month}`) ?? 0;
      if (idx === 0) return { label, value: 0 };

      const prev = slots[idx - 1];
      const prior = byKey.get(`${prev.year}-${prev.month}`) ?? 0;
      const growth =
        prior === 0
          ? 0
          : Math.round(((current - prior) / prior) * 100 * 10) / 10;

      return { label, value: growth };
    });
  }

  private generateMonthSlots(
    count: number,
  ): { year: number; month: number; label: string }[] {
    const now = new Date();
    const slots: { year: number; month: number; label: string }[] = [];

    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      slots.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1, // MongoDB $month is 1-based
        label: MONTH_LABELS[d.getMonth()],
      });
    }

    return slots;
  }
}
