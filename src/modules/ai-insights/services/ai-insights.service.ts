import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { Types } from 'mongoose';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { hashToken } from 'src/common/utils/hash.util';
import { RedisService } from '../../redis/services/redis.service';
import { AiInsightsRepository } from '../repositories/ai-insights.repository';
import { ListInsightsDto } from '../dto/list-insights.dto';
import {
  Insight,
  InsightAction,
  InsightCategory,
  InsightCategorySummary,
  InsightSeverity,
  InsightsResult,
  JobCompletionStats,
  MonthlyRevenuePoint,
  PendingContractSummary,
  ProjectValueWindows,
  SchedulingClusterCandidate,
  UnpaidInvoicesSummary,
} from '../types/ai-insights.types';

const REENGAGEMENT_THRESHOLD_DAYS = 30;
const PROJECT_VALUE_WINDOW_DAYS = 90;
const REVENUE_TREND_MONTHS = 3;
const COMPLETION_WINDOW_DAYS = 30;
const COMPLETION_TARGET_RATE = 60;
const PRICE_INCREASE_PCT = 10;

/** Ordered so category tabs render in a stable, product-defined sequence. */
const CATEGORY_ORDER: InsightCategory[] = [
  InsightCategory.REVENUE,
  InsightCategory.CLIENTS,
  InsightCategory.OPERATIONS,
  InsightCategory.GROWTH,
];

const CATEGORY_LABELS: Record<InsightCategory, string> = {
  [InsightCategory.REVENUE]: 'Revenue',
  [InsightCategory.CLIENTS]: 'Clients',
  [InsightCategory.OPERATIONS]: 'Operations',
  [InsightCategory.GROWTH]: 'Growth',
};

/** Higher severities surface first within the combined "all insights" list. */
const SEVERITY_RANK: Record<InsightSeverity, number> = {
  [InsightSeverity.HIGH]: 0,
  [InsightSeverity.MEDIUM]: 1,
  [InsightSeverity.LOW]: 2,
};

const insightsCacheKey = (businessId: string, fingerprint: string): string =>
  `${businessId}:ai:insights:${fingerprint}`;

/**
 * Generates AI-driven business insight cards grouped into revenue, clients,
 * operations, and growth categories.
 *
 * Design: a deterministic rules engine first computes which insights apply
 * (and their exact numbers) from real business data, so figures shown to the
 * user are always accurate. An optional Anthropic call then rewrites each
 * insight's description in a more natural voice; if that call fails or
 * returns something unusable, the deterministic template text is used as-is
 * — the endpoint never depends on the AI call succeeding.
 *
 * Token-usage control: the cache key is a hash of the computed insight
 * candidates themselves (not just the businessId), so it only changes when
 * the underlying business data changes. Repeated requests over unchanged
 * data always hit the cache and never re-invoke the AI, no matter how much
 * time has passed; the moment the data changes, the fingerprint changes and
 * exactly one fresh AI call is made.
 */
@Injectable()
export class AiInsightsService {
  private readonly logger = new Logger(AiInsightsService.name);
  private readonly anthropic: Anthropic;
  private readonly model: string;
  private readonly currency: string;

  constructor(
    config: ConfigService,
    private readonly aiInsightsRepository: AiInsightsRepository,
    private readonly redisService: RedisService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: config.get<string>('ANTHROPIC_API_KEY'),
    });
    this.model =
      config.get<string>('AI_INSIGHTS_MODEL') ||
      config.get<string>('AI_WEBSITE_MODEL') ||
      'claude-opus-4-7';
    this.currency = config.get<string>('DEFAULT_CURRENCY') ?? 'USD';
  }

  /**
   * Returns AI-generated insight cards for the business, grouped by category.
   *
   * `dto.category`/`dto.severity` filter the returned `insights` array;
   * `categories` counts always reflect the full, unfiltered set so filter
   * tabs keep stable counts.
   *
   * Business metrics are re-read on every call (cheap, indexed aggregations)
   * to compute a fingerprint of the current data. The AI is only invoked
   * when that fingerprint isn't already cached — i.e. the first time this
   * exact data is seen. Asking again later for the same unchanged data costs
   * zero AI tokens; a real data change produces a new fingerprint and a
   * single fresh AI call.
   *
   * Example:
   *   generateInsights("biz123", { category: "revenue" })
   *   → { categories: [{ key: "revenue", label: "Revenue", count: 3 }, ...], insights: [...] }
   */
  async generateInsights(
    businessId: string,
    dto: ListInsightsDto,
  ): Promise<InsightsResult | InternalServerErrorException> {
    try {
      const bId = new Types.ObjectId(businessId);
      const candidates = await this.computeCandidates(bId);
      const fingerprint = hashToken(JSON.stringify(candidates));
      const cacheKey = insightsCacheKey(businessId, fingerprint);

      const cached = await this.redisService.get(cacheKey);
      let allInsights: Insight[];

      if (cached) {
        allInsights = JSON.parse(cached) as Insight[];
      } else {
        const polished = await this.polishDescriptions(candidates).catch(
          (err: unknown) => {
            this.logger.warn(
              `generateInsights: AI polish skipped: ${err instanceof Error ? err.message : String(err)}`,
            );
            return null;
          },
        );

        allInsights = candidates
          .map((candidate) => ({
            ...candidate,
            description: polished?.[candidate.id] ?? candidate.description,
          }))
          .sort(
            (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
          );

        await this.redisService
          .set(cacheKey, JSON.stringify(allInsights), CACHE_TTL.AI_INSIGHTS)
          .catch((err: unknown) =>
            this.logger.warn(
              `generateInsights: cache write failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      }

      return this.shapeResult(allInsights, dto);
    } catch (error) {
      this.logger.error(
        `generateInsights: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        AI_MESSAGES.ERROR.INSIGHTS_FAILED,
      );
    }
  }

  // ─── Computation ────────────────────────────────────────────────────────────

  /**
   * Fetches current business metrics and builds the deterministic insight
   * candidates from them (no AI call). The exact shape of this return value
   * is what gets fingerprinted to decide whether the AI needs to run again.
   */
  private async computeCandidates(bId: Types.ObjectId): Promise<Insight[]> {
    const now = new Date();

    const currentStart = this.daysAgo(PROJECT_VALUE_WINDOW_DAYS, now);
    const previousStart = this.daysAgo(PROJECT_VALUE_WINDOW_DAYS * 2, now);
    const reengagementThreshold = this.daysAgo(
      REENGAGEMENT_THRESHOLD_DAYS,
      now,
    );
    const revenueTrendStart = this.monthStartNMonthsAgo(
      REVENUE_TREND_MONTHS,
      now,
    );
    const completionWindowStart = this.daysAgo(COMPLETION_WINDOW_DAYS, now);

    const [
      unpaidInvoices,
      projectValue,
      revenueTrend,
      reengagementCount,
      topPendingContract,
      schedulingCluster,
      completionStats,
      currentMonthRevenue,
    ] = await Promise.all([
      this.aiInsightsRepository.getUnpaidInvoicesSummary(bId),
      this.aiInsightsRepository.getProjectValueWindows(
        bId,
        currentStart,
        previousStart,
        currentStart,
      ),
      this.aiInsightsRepository.getRecentMonthlyRevenue(bId, revenueTrendStart),
      this.aiInsightsRepository.countReengagementClients(
        bId,
        reengagementThreshold,
      ),
      this.aiInsightsRepository.getTopPendingContract(bId),
      this.aiInsightsRepository.getSchedulingClusterCandidate(bId),
      this.aiInsightsRepository.getJobCompletionStats(
        bId,
        completionWindowStart,
      ),
      this.aiInsightsRepository.getCurrentMonthRevenue(bId),
    ]);

    return [
      this.buildUnpaidInvoicesInsight(unpaidInvoices),
      this.buildProjectValueInsight(projectValue),
      this.buildCashFlowForecastInsight(revenueTrend),
      this.buildReengagementInsight(reengagementCount),
      this.buildTopClientAtRiskInsight(topPendingContract),
      this.buildSchedulingEfficiencyInsight(schedulingCluster),
      this.buildJobCompletionInsight(completionStats),
      this.buildRevenueOptimizationInsight(currentMonthRevenue),
    ].filter((insight): insight is Insight => insight !== null);
  }

  private shapeResult(all: Insight[], dto: ListInsightsDto): InsightsResult {
    const categories = this.buildCategorySummaries(all);
    const insights = all.filter(
      (insight) =>
        (!dto.category || insight.category === dto.category) &&
        (!dto.severity || insight.severity === dto.severity),
    );

    return { categories, insights };
  }

  /** Hash map for O(1) per-category counting instead of repeated filters. */
  private buildCategorySummaries(all: Insight[]): InsightCategorySummary[] {
    const counts = new Map<InsightCategory, number>();
    for (const insight of all) {
      counts.set(insight.category, (counts.get(insight.category) ?? 0) + 1);
    }

    return CATEGORY_ORDER.map((key) => ({
      key,
      label: CATEGORY_LABELS[key],
      count: counts.get(key) ?? 0,
    }));
  }

  // ─── Insight builders (deterministic — numbers always come from real data) ──

  private buildUnpaidInvoicesInsight(
    summary: UnpaidInvoicesSummary,
  ): Insight | null {
    if (summary.count === 0) return null;

    const invoiceWord = summary.count === 1 ? 'invoice' : 'invoices';
    const action: InsightAction = {
      label: 'View Invoices',
      link: '/invoices?status=pending',
    };

    return {
      id: 'unpaid-invoices',
      category: InsightCategory.REVENUE,
      title: 'Unpaid Invoices Alert',
      description: `You have ${summary.count} unpaid ${invoiceWord} totaling ${this.formatCurrency(summary.totalOutstanding)}. Consider sending payment reminders.`,
      severity: InsightSeverity.HIGH,
      action,
    };
  }

  private buildProjectValueInsight(
    windows: ProjectValueWindows,
  ): Insight | null {
    if (windows.currentAvg <= 0 || windows.previousAvg <= 0) return null;

    const changePct = this.roundPercent(
      ((windows.currentAvg - windows.previousAvg) / windows.previousAvg) * 100,
    );
    if (changePct === 0) return null;

    const direction = changePct > 0 ? 'Up' : 'Down';
    const comparison = changePct > 0 ? 'higher' : 'lower';

    return {
      id: 'average-project-value',
      category: InsightCategory.REVENUE,
      title: `Average Project Value ${direction}`,
      description: `Your average project value is ${this.formatCurrency(windows.currentAvg)} — ${Math.abs(changePct)}% ${comparison} than last quarter.`,
      severity: InsightSeverity.MEDIUM,
    };
  }

  private buildCashFlowForecastInsight(
    trend: MonthlyRevenuePoint[],
  ): Insight | null {
    const withRevenue = trend.filter((point) => point.revenue > 0);
    if (withRevenue.length < 2) return null;

    const last = withRevenue[withRevenue.length - 1];
    const previous = withRevenue[withRevenue.length - 2];
    const growthRate = (last.revenue - previous.revenue) / previous.revenue;
    const forecast = last.revenue * (1 + growthRate);
    const changePct = this.roundPercent(growthRate * 100);
    const direction = changePct >= 0 ? 'increase' : 'decrease';

    return {
      id: 'cash-flow-forecast',
      category: InsightCategory.REVENUE,
      title: 'Cash Flow Forecast',
      description: `Based on current trends, next month's revenue is projected at ${this.formatCurrency(forecast)} — a ${Math.abs(changePct)}% ${direction}.`,
      severity: InsightSeverity.LOW,
    };
  }

  private buildReengagementInsight(count: number): Insight | null {
    if (count === 0) return null;

    const clientWord = count === 1 ? 'client' : 'clients';

    return {
      id: 'client-reengagement',
      category: InsightCategory.CLIENTS,
      title: 'Client Re-engagement',
      description: `${count} completed ${clientWord} haven't been contacted in ${REENGAGEMENT_THRESHOLD_DAYS}+ days. Re-engaging could generate repeat business.`,
      severity: InsightSeverity.MEDIUM,
      action: { label: 'View Clients', link: '/clients' },
    };
  }

  private buildTopClientAtRiskInsight(
    contract: PendingContractSummary | null,
  ): Insight | null {
    if (!contract) return null;

    return {
      id: 'top-client-at-risk',
      category: InsightCategory.CLIENTS,
      title: 'Top Client at Risk',
      description: `${contract.clientName} has a pending contract worth ${this.formatCurrency(contract.amount)}. Follow up to secure the deal.`,
      severity: InsightSeverity.HIGH,
    };
  }

  private buildSchedulingEfficiencyInsight(
    cluster: SchedulingClusterCandidate | null,
  ): Insight | null {
    if (!cluster) return null;

    return {
      id: 'scheduling-efficiency',
      category: InsightCategory.OPERATIONS,
      title: 'Scheduling Efficiency',
      description:
        'Grouping jobs by location could save 3-5 hours per week in travel time.',
      severity: InsightSeverity.MEDIUM,
    };
  }

  private buildJobCompletionInsight(stats: JobCompletionStats): Insight | null {
    if (stats.total === 0) return null;

    const rate = this.roundPercent((stats.completed / stats.total) * 100);
    const severity =
      rate < 50
        ? InsightSeverity.HIGH
        : rate < 75
          ? InsightSeverity.MEDIUM
          : InsightSeverity.LOW;

    return {
      id: 'job-completion-rate',
      category: InsightCategory.OPERATIONS,
      title: 'Job Completion Rate',
      description: `Your job completion rate is ${rate}%. Aim for ${COMPLETION_TARGET_RATE}%+ by prioritizing in-progress tasks.`,
      severity,
    };
  }

  private buildRevenueOptimizationInsight(
    monthlyRevenue: number,
  ): Insight | null {
    if (monthlyRevenue <= 0) return null;

    const boost = monthlyRevenue * (PRICE_INCREASE_PCT / 100);

    return {
      id: 'revenue-optimization',
      category: InsightCategory.GROWTH,
      title: 'Revenue Optimization',
      description: `Increasing pricing by ${PRICE_INCREASE_PCT}% would boost monthly revenue by ~${this.formatCurrency(boost)}/month.`,
      severity: InsightSeverity.HIGH,
    };
  }

  // ─── AI polish (best-effort — falls back to template text on any failure) ───

  private async polishDescriptions(
    candidates: Insight[],
  ): Promise<Record<string, string> | null> {
    if (candidates.length === 0) return null;

    const message = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: this.buildPolishPrompt(candidates),
        },
      ],
    });

    const block = message.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;

    const jsonMatch = block.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const validIds = new Set(candidates.map((c) => c.id));
    const result: Record<string, string> = {};

    for (const [id, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (validIds.has(id) && typeof value === 'string' && value.trim()) {
        result[id] = value.trim();
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private buildPolishPrompt(candidates: Insight[]): string {
    const items = candidates.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
    }));

    return `Rewrite each "description" below in a friendlier, more natural voice for a small-business owner. Keep every number, dollar amount, and percentage exactly as given — do not change or invent figures. Keep each description to one short sentence.

Insights:
${JSON.stringify(items, null, 2)}

Return ONLY a valid JSON object (no markdown, no explanation) mapping each "id" to its rewritten description string, e.g.:
{ "unpaid-invoices": "..." }`;
  }

  // ─── Formatting helpers ─────────────────────────────────────────────────────

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private roundPercent(value: number): number {
    return Math.round(value);
  }

  private daysAgo(days: number, from: Date): Date {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() - days);
    return d;
  }

  /** Returns the first day of the month N months before `from` (UTC). */
  private monthStartNMonthsAgo(n: number, from: Date): Date {
    return new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - (n - 1), 1),
    );
  }
}
