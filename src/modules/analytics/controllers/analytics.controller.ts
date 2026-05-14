import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ANALYTICS_MESSAGES } from 'src/common/constants/messages/analytics.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { TrafficQueryDto } from '../dto/traffic-query.dto';
import { RevenueQueryDto } from '../dto/revenue-query.dto';
import { AnalyticsService } from '../services/analytics.service';

/**
 * Serves read-only analytics endpoints for the business portal.
 *
 * All routes are scoped to the authenticated user's business via `businessId`
 * from the JWT. TenantGuard validates the business on every request.
 *
 * Route prefix: /api/analytics
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /analytics/traffic
   *
   * Returns daily visitors, page views, top pages, and aggregate stats for
   * the business's published website over a given date range.
   *
   * Query params:
   *   dateFrom (optional) — ISO date, defaults to 7 days ago
   *   dateTo   (optional) — ISO date, defaults to today
   */
  @Get('traffic')
  @HttpCode(HttpStatus.OK)
  async getTrafficAnalytics(
    @CurrentUser() user: JwtUser,
    @Query() query: TrafficQueryDto,
  ) {
    const result = await this.analyticsService.getTrafficAnalytics(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: ANALYTICS_MESSAGES.SUCCESS.TRAFFIC_RETRIEVED,
      data: result,
    };
  }

  /**
   * GET /analytics/revenue
   *
   * Returns monthly revenue buckets for the last N months (default 7).
   * Zero-revenue months are included to keep the chart series continuous.
   *
   * Query params:
   *   months (optional, 1–24) — defaults to 7
   */
  @Get('revenue')
  @HttpCode(HttpStatus.OK)
  async getRevenueChart(
    @CurrentUser() user: JwtUser,
    @Query() query: RevenueQueryDto,
  ) {
    const result = await this.analyticsService.getRevenueChart(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: ANALYTICS_MESSAGES.SUCCESS.REVENUE_RETRIEVED,
      data: result,
    };
  }

  /**
   * GET /analytics/jobs
   *
   * Returns job count and percentage share for each of the four statuses:
   * pending, in_progress, completed, cancelled.
   *
   * All four statuses are always present (zero-filled when needed).
   */
  @Get('jobs')
  @HttpCode(HttpStatus.OK)
  async getJobsAnalytics(@CurrentUser() user: JwtUser) {
    const result = await this.analyticsService.getJobsAnalytics(
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: ANALYTICS_MESSAGES.SUCCESS.JOBS_RETRIEVED,
      data: result,
    };
  }

  /**
   * GET /analytics/dashboard
   *
   * Returns aggregated dashboard statistics in a single request:
   *   - Current-month revenue
   *   - Active clients count
   *   - Outstanding invoices (count + total balance)
   *   - Review count (placeholder: 0)
   *   - Last 5 activity log entries
   *   - Top 5 clients by total spend
   */
  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  async getDashboard(@CurrentUser() user: JwtUser) {
    const result = await this.analyticsService.getDashboard(user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: ANALYTICS_MESSAGES.SUCCESS.DASHBOARD_RETRIEVED,
      data: result,
    };
  }
}
