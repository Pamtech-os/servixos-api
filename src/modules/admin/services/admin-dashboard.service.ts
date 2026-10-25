import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import type {
  DailyCountBucket,
  DailyRevenueBucket,
} from '../repositories/admin-dashboard.repository';
import { AdminDashboardRepository } from '../repositories/admin-dashboard.repository';
import type {
  DashboardPeriod,
  DashboardStats,
  MonthlyDataPoint,
} from '../types/admin.types';

const MONTHS_HISTORY = 6;
const RECENT_ACTIVITIES_LIMIT = 5;

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

  /** Aggregate all dashboard stats in a single parallel fetch. Pass `period` to scope all data to a date range. */
  async getDashboardStats(
    period?: DashboardPeriod,
  ): Promise<DashboardStats | InternalServerErrorException> {
    try {
      if (period) {
        return await this.getFilteredStats(period);
      }
      return await this.getDefaultStats();
    } catch (error) {
      this.logger.error(
        `getDashboardStats: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Default view: current-month revenue KPIs, 6-month charts, last 5 activities. */
  private async getDefaultStats(): Promise<DashboardStats> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      revenue,
      activeBusinesses,
      revenueHistory,
      businessHistory,
      recentActivities,
    ] = await Promise.all([
      this.dashboardRepository.countTotalUsers(),
      this.dashboardRepository.sumRevenue(monthStart, now),
      this.dashboardRepository.countActiveBusinesses(),
      this.dashboardRepository.revenueByMonth(MONTHS_HISTORY),
      this.dashboardRepository.businessCountByMonth(MONTHS_HISTORY),
      this.dashboardRepository.findRecentActivities(RECENT_ACTIVITIES_LIMIT),
    ]);

    return {
      totalUsers,
      monthlyRevenue: revenue,
      activeBusinesses,
      revenueHistory: this.buildMonthlyRevenueTimeline(revenueHistory),
      growthHistory: this.buildMonthlyGrowthTimeline(businessHistory),
      recentActivities,
    };
  }

  /** Filtered view: all stats and charts scoped to the chosen period's date range. */
  private async getFilteredStats(
    period: DashboardPeriod,
  ): Promise<DashboardStats> {
    const { from, to } = this.resolveDateRange(period);

    const [
      totalUsers,
      revenue,
      activeBusinesses,
      revenueHistory,
      businessHistory,
      recentActivities,
    ] = await Promise.all([
      this.dashboardRepository.countTotalUsers(from),
      this.dashboardRepository.sumRevenue(from, to),
      this.dashboardRepository.countActiveBusinesses(from),
      this.dashboardRepository.revenueByDay(from, to),
      this.dashboardRepository.businessCountByDay(from, to),
      this.dashboardRepository.findRecentActivities(
        RECENT_ACTIVITIES_LIMIT,
        from,
      ),
    ]);

    return {
      totalUsers,
      monthlyRevenue: revenue,
      activeBusinesses,
      revenueHistory: this.buildDailyRevenueTimeline(from, to, revenueHistory),
      growthHistory: this.buildDailyGrowthTimeline(from, to, businessHistory),
      recentActivities,
    };
  }

  /** Number of days to subtract from today (inclusive) for each period. */
  private readonly PERIOD_DAYS_BACK: Record<DashboardPeriod, number> = {
    today: 0,
    last7days: 6,
    last30days: 29,
  };

  /** Compute the absolute date range for a named period. */
  private resolveDateRange(period: DashboardPeriod): { from: Date; to: Date } {
    const to = new Date();
    const today = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    const from = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - this.PERIOD_DAYS_BACK[period],
    );
    return { from, to };
  }

  /**
   * Build a contiguous N-month timeline filling missing months with 0.
   * Hash map for O(1) lookup by "YYYY-M" key avoids a second DB round-trip.
   */
  private buildMonthlyRevenueTimeline(
    buckets: { year: number; month: number; total: number }[],
  ): MonthlyDataPoint[] {
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
  private buildMonthlyGrowthTimeline(
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

  /** Build a contiguous day-by-day revenue timeline filling missing days with 0. */
  private buildDailyRevenueTimeline(
    from: Date,
    to: Date,
    buckets: DailyRevenueBucket[],
  ): MonthlyDataPoint[] {
    // Hash map for O(1) lookup by "YYYY-M-D" key
    const byKey = new Map(
      buckets.map((b) => [`${b.year}-${b.month}-${b.day}`, b.total]),
    );
    return this.generateDaySlots(from, to).map(
      ({ year, month, day, label }) => ({
        label,
        value: byKey.get(`${year}-${month}-${day}`) ?? 0,
      }),
    );
  }

  /** Build a contiguous day-by-day new-business count timeline filling missing days with 0. */
  private buildDailyGrowthTimeline(
    from: Date,
    to: Date,
    buckets: DailyCountBucket[],
  ): MonthlyDataPoint[] {
    // Hash map for O(1) lookup by "YYYY-M-D" key
    const byKey = new Map(
      buckets.map((b) => [`${b.year}-${b.month}-${b.day}`, b.count]),
    );
    return this.generateDaySlots(from, to).map(
      ({ year, month, day, label }) => ({
        label,
        value: byKey.get(`${year}-${month}-${day}`) ?? 0,
      }),
    );
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

  /** Generate one slot per calendar day from `from` to `to` inclusive. */
  private generateDaySlots(
    from: Date,
    to: Date,
  ): { year: number; month: number; day: number; label: string }[] {
    const slots: { year: number; month: number; day: number; label: string }[] =
      [];
    const cursor = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate(),
    );
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());

    while (cursor <= end) {
      slots.push({
        year: cursor.getFullYear(),
        month: cursor.getMonth() + 1,
        day: cursor.getDate(),
        label: `${MONTH_LABELS[cursor.getMonth()]} ${cursor.getDate()}`,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return slots;
  }
}
