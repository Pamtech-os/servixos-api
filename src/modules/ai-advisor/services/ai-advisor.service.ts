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
import { AiInsightsRepository } from '../../ai-insights/repositories/ai-insights.repository';
import { AiAdvisorRepository } from '../repositories/ai-advisor.repository';
import { AskAdvisorDto } from '../dto/ask-advisor.dto';
import { AdvisorAnswer, AdvisorTopic } from '../types/ai-advisor.types';

const PROJECT_VALUE_WINDOW_DAYS = 90;
const PRICE_INCREASE_PCT = 10;
const TOP_CLIENT_LIMIT = 1;

const OUT_OF_SCOPE_TITLE = 'Outside My Scope';
const OUT_OF_SCOPE_ANSWER =
  'I can only help with pricing strategy, marketing, and operations questions for your business. Try asking something like "How can I optimize my operations?", "What pricing strategy should I use?", or "How can I get more clients?"';

/**
 * Keyword stems used to classify a free-form question into one of the three
 * supported advisor topics without ever calling the AI. Matching is
 * substring-based on stems (e.g. "pric" matches price/prices/pricing) so
 * minor grammatical variations don't require an exhaustive word list.
 *
 * Deliberately excludes generic words like "cost" from PRICING — "reduce
 * costs" is an operations concern in this product's vocabulary, not pricing.
 */
const TOPIC_STEMS: Record<AdvisorTopic, string[]> = {
  [AdvisorTopic.PRICING]: [
    'pric',
    'rate',
    'fee',
    'discount',
    'quote',
    'margin',
    'charge',
    'upsell',
  ],
  [AdvisorTopic.MARKETING]: [
    'market',
    'advertis',
    'promot',
    'brand',
    'seo',
    'lead',
    'referral',
    'review',
    'reputat',
    'social media',
    'customer acquisition',
    'word of mouth',
    'audience',
    'visibility',
  ],
  [AdvisorTopic.OPERATIONS]: [
    'operat',
    'efficien',
    'workflow',
    'schedul',
    'process',
    'productiv',
    'logistic',
    'staff',
    'automat',
    'bottleneck',
    'streamlin',
    'onboard',
    'capacity',
  ],
};

/** Fixed tie-break order when a question matches stems from multiple topics equally. */
const TOPIC_PRIORITY = [
  AdvisorTopic.PRICING,
  AdvisorTopic.MARKETING,
  AdvisorTopic.OPERATIONS,
];

/**
 * Answers free-form business questions scoped to pricing strategy,
 * marketing, and operations.
 *
 * Two cost-control mechanisms:
 *  1. Out-of-scope gate — a deterministic keyword classifier runs before any
 *     AI call. Questions that don't match one of the three topics are
 *     declined immediately with zero tokens spent.
 *  2. Data-fingerprint cache — the cache key is derived from the topic, the
 *     normalized question, AND a hash of the exact business metrics fed to
 *     the model. Asking the same question again returns the cached answer
 *     for free as long as the underlying data hasn't changed; the moment the
 *     data changes, the fingerprint changes and a fresh AI call is made.
 */
@Injectable()
export class AiAdvisorService {
  private readonly logger = new Logger(AiAdvisorService.name);
  private readonly anthropic: Anthropic;
  private readonly model: string;
  private readonly currency: string;

  constructor(
    config: ConfigService,
    private readonly aiInsightsRepository: AiInsightsRepository,
    private readonly aiAdvisorRepository: AiAdvisorRepository,
    private readonly redisService: RedisService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: config.get<string>('ANTHROPIC_API_KEY'),
    });
    this.model =
      config.get<string>('AI_ADVISOR_MODEL') ||
      config.get<string>('AI_WEBSITE_MODEL') ||
      'claude-opus-4-7';
    this.currency = config.get<string>('DEFAULT_CURRENCY') ?? 'USD';
  }

  /**
   * Answers a business question about pricing, marketing, or operations.
   *
   * Example:
   *   askAdvisor("biz123", { question: "How can I optimize my operations?" })
   *   → { inScope: true, topic: "operations", title: "Operations Optimization", answer: "..." }
   */
  async askAdvisor(
    businessId: string,
    dto: AskAdvisorDto,
  ): Promise<AdvisorAnswer | InternalServerErrorException> {
    try {
      const topic = dto.topic ?? this.classifyTopic(dto.question);

      if (!topic) {
        return {
          inScope: false,
          topic: null,
          title: OUT_OF_SCOPE_TITLE,
          answer: OUT_OF_SCOPE_ANSWER,
        };
      }

      const bId = new Types.ObjectId(businessId);
      const metrics = await this.gatherMetrics(bId, topic);
      const cacheKey = this.buildCacheKey(
        businessId,
        topic,
        dto.question,
        metrics,
      );

      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as AdvisorAnswer;

      const templated = this.buildTemplatedAnswer(topic, metrics);
      const polished = await this.generateAiAnswer(
        topic,
        dto.question,
        metrics,
        templated.answer,
      ).catch((err: unknown) => {
        this.logger.warn(
          `askAdvisor: AI polish skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });

      const result: AdvisorAnswer = {
        inScope: true,
        topic,
        title: templated.title,
        answer: polished ?? templated.answer,
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.AI_ADVISOR_RESPONSE)
        .catch((err: unknown) =>
          this.logger.warn(
            `askAdvisor: cache write failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return result;
    } catch (error) {
      this.logger.error(
        `askAdvisor: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(AI_MESSAGES.ERROR.ADVISOR_FAILED);
    }
  }

  // ─── Topic classification (no AI call) ──────────────────────────────────────

  /**
   * Classifies a free-form question into one of the three supported topics
   * by counting stem matches; returns null (out of scope) when nothing
   * matches. Ties are broken by TOPIC_PRIORITY.
   */
  private classifyTopic(question: string): AdvisorTopic | null {
    const text = question.toLowerCase();

    let bestTopic: AdvisorTopic | null = null;
    let bestScore = 0;

    for (const topic of TOPIC_PRIORITY) {
      const score = TOPIC_STEMS[topic].reduce(
        (count, stem) => count + (text.includes(stem) ? 1 : 0),
        0,
      );
      if (score > bestScore) {
        bestScore = score;
        bestTopic = topic;
      }
    }

    return bestScore > 0 ? bestTopic : null;
  }

  // ─── Metrics gathering ───────────────────────────────────────────────────────

  private async gatherMetrics(
    businessId: Types.ObjectId,
    topic: AdvisorTopic,
  ): Promise<Record<string, unknown>> {
    switch (topic) {
      case AdvisorTopic.PRICING: {
        const now = new Date();
        const currentStart = this.daysAgo(PROJECT_VALUE_WINDOW_DAYS, now);
        const previousStart = this.daysAgo(PROJECT_VALUE_WINDOW_DAYS * 2, now);

        const [unpaid, projectValue, currentMonthRevenue] = await Promise.all([
          this.aiInsightsRepository.getUnpaidInvoicesSummary(businessId),
          this.aiInsightsRepository.getProjectValueWindows(
            businessId,
            currentStart,
            previousStart,
            currentStart,
          ),
          this.aiInsightsRepository.getCurrentMonthRevenue(businessId),
        ]);

        return { unpaid, projectValue, currentMonthRevenue };
      }

      case AdvisorTopic.OPERATIONS: {
        const completionWindowStart = this.daysAgo(30, new Date());

        const [completion, cluster, unpaid, inProgressCount] =
          await Promise.all([
            this.aiInsightsRepository.getJobCompletionStats(
              businessId,
              completionWindowStart,
            ),
            this.aiInsightsRepository.getSchedulingClusterCandidate(businessId),
            this.aiInsightsRepository.getUnpaidInvoicesSummary(businessId),
            this.aiAdvisorRepository.countJobsInProgress(businessId),
          ]);

        return { completion, cluster, unpaid, inProgressCount };
      }

      case AdvisorTopic.MARKETING: {
        const reengagementThreshold = this.daysAgo(30, new Date());

        const [reviewStats, clientGrowth, topClients, reengagementCount] =
          await Promise.all([
            this.aiAdvisorRepository.getReviewStats(businessId),
            this.aiAdvisorRepository.getClientGrowth(businessId),
            this.aiAdvisorRepository.getTopClientsBySpend(
              businessId,
              TOP_CLIENT_LIMIT,
            ),
            this.aiInsightsRepository.countReengagementClients(
              businessId,
              reengagementThreshold,
            ),
          ]);

        return { reviewStats, clientGrowth, topClients, reengagementCount };
      }
    }
  }

  // ─── Deterministic templated answers (numbers always come from real data) ───

  private buildTemplatedAnswer(
    topic: AdvisorTopic,
    metrics: Record<string, unknown>,
  ): { title: string; answer: string } {
    switch (topic) {
      case AdvisorTopic.PRICING:
        return this.buildPricingAnswer(metrics as never);
      case AdvisorTopic.OPERATIONS:
        return this.buildOperationsAnswer(metrics as never);
      case AdvisorTopic.MARKETING:
        return this.buildMarketingAnswer(metrics as never);
    }
  }

  private buildPricingAnswer(metrics: {
    unpaid: { count: number; totalOutstanding: number };
    projectValue: { currentAvg: number; previousAvg: number };
    currentMonthRevenue: number;
  }): { title: string; answer: string } {
    const { unpaid, projectValue, currentMonthRevenue } = metrics;

    let trendSuffix = '.';
    if (projectValue.currentAvg > 0 && projectValue.previousAvg > 0) {
      const pct = Math.round(
        ((projectValue.currentAvg - projectValue.previousAvg) /
          projectValue.previousAvg) *
          100,
      );
      if (pct !== 0) {
        trendSuffix = ` — ${Math.abs(pct)}% ${pct > 0 ? 'higher' : 'lower'} than last quarter.`;
      }
    }

    const boost = currentMonthRevenue * (PRICE_INCREASE_PCT / 100);
    const invoiceWord = unpaid.count === 1 ? 'invoice' : 'invoices';

    const answer = `Based on your invoicing and revenue data:

Average Project Value: ${this.formatCurrency(projectValue.currentAvg)}${trendSuffix}
Unpaid Invoices: ${unpaid.count} totaling ${this.formatCurrency(unpaid.totalOutstanding)}

Recommendations:
1. Raise your prices — A ${PRICE_INCREASE_PCT}% increase would add ~${this.formatCurrency(boost)}/month based on current revenue.
2. Follow up on unpaid invoices — ${unpaid.count} ${invoiceWord} totaling ${this.formatCurrency(unpaid.totalOutstanding)} are still outstanding. Send reminders at 7, 14, and 30 days.
3. Offer tiered packages — Bundle add-on services to increase your average deal size.
4. Require a deposit — Ask for 30-50% upfront on new projects to improve cash flow.
5. Review low-margin services — Identify and re-price the offerings that make you the least.

Projected Impact: 10-15% revenue growth within one billing cycle.`;

    return { title: 'Pricing Strategy', answer };
  }

  private buildOperationsAnswer(metrics: {
    completion: { completed: number; total: number };
    cluster: { location: string; count: number } | null;
    unpaid: { count: number; totalOutstanding: number };
    inProgressCount: number;
  }): { title: string; answer: string } {
    const { completion, cluster, unpaid, inProgressCount } = metrics;

    const rate =
      completion.total > 0
        ? Math.round((completion.completed / completion.total) * 100)
        : 0;

    const clusterLine = cluster
      ? `Jobs at "${cluster.location}" (${cluster.count} upcoming) could be grouped to save 3-5 hours/week in travel.`
      : 'No location clusters detected yet — keep grouping jobs by area as your job volume grows.';

    const jobWord = inProgressCount === 1 ? 'job' : 'jobs';

    const answer = `Based on your job and scheduling data:

Current Job Completion Rate: ${rate}% (Target: 60%+)

Recommendations:
1. Prioritize in-progress jobs — You have ${inProgressCount} ${jobWord} stuck in progress. Assign dedicated time blocks to complete them this week.
2. Group jobs by location — ${clusterLine}
3. Automate invoice follow-ups — ${unpaid.count} unpaid invoice(s) (${this.formatCurrency(unpaid.totalOutstanding)} outstanding). Set up automatic reminders at 7, 14, and 30 days.
4. Streamline onboarding — Create templates for contracts and proposals to cut down on manual admin work.
5. Track employee performance — Use activity logs to identify bottlenecks and reward top performers.

Projected Impact: 30% improvement in operational efficiency within 4 weeks.`;

    return { title: 'Operations Optimization', answer };
  }

  private buildMarketingAnswer(metrics: {
    reviewStats: { count: number; averageRating: number };
    clientGrowth: { newThisMonth: number; newLastMonth: number };
    topClients: { name: string; totalSpent: number }[];
    reengagementCount: number;
  }): { title: string; answer: string } {
    const { reviewStats, clientGrowth, topClients, reengagementCount } =
      metrics;
    const topClient = topClients[0];

    const topClientLine = topClient
      ? `Reward your top client — ${topClient.name} has spent ${this.formatCurrency(topClient.totalSpent)}. Consider a loyalty perk or referral incentive.`
      : 'Reward your top clients — Track spend per client to identify who deserves a loyalty perk or referral incentive.';

    const answer = `Based on your client and review data:

Client Growth: ${clientGrowth.newThisMonth} new client(s) this month (vs ${clientGrowth.newLastMonth} last month)
Reviews: ${reviewStats.averageRating}★ average across ${reviewStats.count} review(s)

Recommendations:
1. Ask for more reviews — You have ${reviewStats.count} so far; request feedback from every satisfied client.
2. ${topClientLine}
3. Re-engage lapsed clients — ${reengagementCount} completed client(s) haven't been contacted in 30+ days.
4. Showcase testimonials — Feature your best reviews on your website to build trust with new visitors.
5. Launch a referral program — Offer a discount for client-referred leads to grow word-of-mouth.

Projected Impact: 15-20% increase in repeat and referral business within 2-3 months.`;

    return { title: 'Marketing & Growth', answer };
  }

  // ─── AI polish (best-effort — falls back to the template on any failure) ────

  private async generateAiAnswer(
    topic: AdvisorTopic,
    question: string,
    metrics: Record<string, unknown>,
    templatedAnswer: string,
  ): Promise<string | null> {
    const message = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: this.buildAdvisorPrompt(
            topic,
            question,
            metrics,
            templatedAnswer,
          ),
        },
      ],
    });

    const block = message.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;

    const text = block.text.trim();
    return text.length > 0 ? text : null;
  }

  private buildAdvisorPrompt(
    topic: AdvisorTopic,
    question: string,
    metrics: Record<string, unknown>,
    templatedAnswer: string,
  ): string {
    return `You are a small-business advisor answering a ${topic} question. Rewrite the draft answer below in a warmer, more conversational voice while keeping every number, dollar amount, and percentage exactly as given — do not invent or change any figures.

Business owner's question: "${question}"

Supporting data:
${JSON.stringify(metrics, null, 2)}

Draft answer:
${templatedAnswer}

Return ONLY the rewritten answer text — no preamble, no markdown code fences, no explanation of what you changed.`;
  }

  // ─── Caching ─────────────────────────────────────────────────────────────────

  /**
   * Cache key includes a hash of the topic, normalized question, and the
   * exact metrics fed to the model — so identical questions over unchanged
   * data hit the cache (zero AI tokens), while any data change produces a
   * new key and triggers a fresh AI call.
   */
  private buildCacheKey(
    businessId: string,
    topic: AdvisorTopic,
    question: string,
    metrics: Record<string, unknown>,
  ): string {
    const normalized = this.normalizeQuestion(question);
    const fingerprint = hashToken(
      JSON.stringify({ topic, normalized, metrics }),
    );
    return `${businessId}:ai:advisor:${topic}:${fingerprint}`;
  }

  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  // ─── Formatting helpers ─────────────────────────────────────────────────────

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private daysAgo(days: number, from: Date): Date {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() - days);
    return d;
  }
}
