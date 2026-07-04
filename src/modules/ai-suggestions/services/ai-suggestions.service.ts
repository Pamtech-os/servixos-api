import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { PLAN_LIMITS } from 'src/common/constants/subscription-features.constants';
import { hashToken } from 'src/common/utils/hash.util';
import { toTwoDecimal } from 'src/common/utils/number.util';
import { clientFollowUpTemplate } from '../../email/templates/client-follow-up.template';
import { EmailService } from '../../email/services/email.service';
import {
  Business,
  SubscriptionPlan,
} from '../../business/schemas/business.schema';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { AiInsightsRepository } from '../../ai-insights/repositories/ai-insights.repository';
import type {
  MonthlyRevenuePoint,
  UnpaidInvoicesSummary,
} from '../../ai-insights/types/ai-insights.types';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { RedisService } from '../../redis/services/redis.service';
import { AiSuggestionsRepository } from '../repositories/ai-suggestions.repository';
import {
  ApplySuggestionResult,
  DismissSuggestionResult,
  IdleClient,
  Suggestion,
  SuggestionId,
  SuggestionsResult,
  SuggestionTag,
} from '../types/ai-suggestions.types';

const IDLE_CLIENT_THRESHOLD_DAYS = 30;
const IDLE_CLIENT_LIMIT = 10;
const STALE_JOB_LIMIT = 50;
const UNPAID_INVOICE_LIMIT = 20;
const PRICE_INCREASE_PCT = 10;
const REVENUE_TREND_MONTHS = 3;

interface SuggestionCandidate {
  id: SuggestionId;
  text: string;
  tag: SuggestionTag;
  /** Hash of the exact data behind this suggestion — used to detect "already resolved for this data" vs. "a new occurrence". */
  fingerprint: string;
  /** Performs the one-click mutation and returns a short human-readable summary of what happened. */
  apply: () => Promise<string>;
}

/**
 * Generates actionable "grow your business" suggestions, each with a
 * one-click Apply action that mutates real business data — no forms, no
 * follow-up steps required from the user.
 *
 * Every Apply action is deliberately chosen to be precondition-free (no
 * signed contracts, no missing fields) so it always succeeds: sending an
 * email, bulk-updating a job status/price, or writing a single field on the
 * business record. This is what keeps "Apply" smooth and error-free.
 *
 * Once applied or dismissed, a suggestion is marked resolved for its current
 * data fingerprint (see CACHE_TTL.AI_SUGGESTION_RESOLVED) so it drops out of
 * the list immediately — "the list becomes less" — but a genuinely new
 * occurrence of the same issue (different clients/invoices/jobs) reappears.
 */
@Injectable()
export class AiSuggestionsService {
  private readonly logger = new Logger(AiSuggestionsService.name);
  private readonly currency: string;

  constructor(
    config: ConfigService,
    private readonly businessRepository: BusinessRepository,
    private readonly aiInsightsRepository: AiInsightsRepository,
    private readonly aiSuggestionsRepository: AiSuggestionsRepository,
    private readonly invoicesService: InvoicesService,
    private readonly emailService: EmailService,
    private readonly redisService: RedisService,
  ) {
    this.currency = config.get<string>('DEFAULT_CURRENCY') ?? 'USD';
  }

  /**
   * Returns the current list of suggestions for the business, capped by the
   * plan's `maxAiSuggestions` limit.
   */
  async listSuggestions(
    businessId: string,
  ): Promise<
    SuggestionsResult | NotFoundException | InternalServerErrorException
  > {
    try {
      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const bId = new Types.ObjectId(businessId);
      const candidates = await this.buildCandidates(bId, businessId, business);
      const unresolved = await this.filterUnresolved(businessId, candidates);
      const limit = this.suggestionLimit(business.subscription.plan);
      const visible = unresolved.slice(0, limit);

      return {
        count: visible.length,
        suggestions: visible.map((c) => this.toSuggestion(c)),
      };
    } catch (error) {
      this.logger.error(
        `listSuggestions: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        AI_MESSAGES.ERROR.SUGGESTIONS_FAILED,
      );
    }
  }

  /**
   * Applies a suggestion's one-click action and marks it resolved so it no
   * longer appears (for this data fingerprint).
   */
  async applySuggestion(
    businessId: string,
    id: SuggestionId,
  ): Promise<
    ApplySuggestionResult | NotFoundException | InternalServerErrorException
  > {
    try {
      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const bId = new Types.ObjectId(businessId);
      const candidates = await this.buildCandidates(bId, businessId, business);
      const unresolved = await this.filterUnresolved(businessId, candidates);
      const target = unresolved.find((c) => c.id === id);
      if (!target) {
        return new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND);
      }

      const summary = await target.apply();
      await this.markResolved(businessId, target.id, target.fingerprint);

      const limit = this.suggestionLimit(business.subscription.plan);
      const remaining = Math.min(unresolved.length - 1, limit);

      return { id, summary, remaining };
    } catch (error) {
      this.logger.error(
        `applySuggestion: unexpected error [businessId=${businessId}, id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        AI_MESSAGES.ERROR.SUGGESTIONS_FAILED,
      );
    }
  }

  /** Dismisses a suggestion without applying it — it drops out of the list for this data fingerprint. */
  async dismissSuggestion(
    businessId: string,
    id: SuggestionId,
  ): Promise<
    DismissSuggestionResult | NotFoundException | InternalServerErrorException
  > {
    try {
      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const bId = new Types.ObjectId(businessId);
      const candidates = await this.buildCandidates(bId, businessId, business);
      const unresolved = await this.filterUnresolved(businessId, candidates);
      const target = unresolved.find((c) => c.id === id);
      if (!target) {
        return new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND);
      }

      await this.markResolved(businessId, target.id, target.fingerprint);

      const limit = this.suggestionLimit(business.subscription.plan);
      const remaining = Math.min(unresolved.length - 1, limit);

      return { id, remaining };
    } catch (error) {
      this.logger.error(
        `dismissSuggestion: unexpected error [businessId=${businessId}, id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        AI_MESSAGES.ERROR.SUGGESTIONS_FAILED,
      );
    }
  }

  // ─── Candidate computation ───────────────────────────────────────────────────

  private async buildCandidates(
    bId: Types.ObjectId,
    businessId: string,
    business: Business,
  ): Promise<SuggestionCandidate[]> {
    const now = new Date();
    const idleThreshold = this.daysAgo(IDLE_CLIENT_THRESHOLD_DAYS, now);
    const revenueTrendStart = this.monthStartNMonthsAgo(
      REVENUE_TREND_MONTHS,
      now,
    );

    const [
      idleClients,
      staleJobIds,
      unpaid,
      unpaidInvoiceIds,
      futurePricedJobsCount,
      currentMonthRevenue,
      revenueTrend,
    ] = await Promise.all([
      this.aiSuggestionsRepository.getIdleClients(
        bId,
        idleThreshold,
        IDLE_CLIENT_LIMIT,
      ),
      this.aiSuggestionsRepository.findStaleInProgressJobIds(
        bId,
        now,
        STALE_JOB_LIMIT,
      ),
      this.aiInsightsRepository.getUnpaidInvoicesSummary(bId),
      this.aiSuggestionsRepository.getUnpaidInvoiceIds(
        bId,
        UNPAID_INVOICE_LIMIT,
      ),
      this.aiSuggestionsRepository.countFuturePricedJobs(bId, now),
      this.aiInsightsRepository.getCurrentMonthRevenue(bId),
      this.aiInsightsRepository.getRecentMonthlyRevenue(bId, revenueTrendStart),
    ]);

    return [
      this.buildClientFollowUpsCandidate(business, idleClients),
      this.buildCompleteStaleJobsCandidate(bId, staleJobIds),
      this.buildRevenueTargetCandidate(business, revenueTrend, now),
      this.buildPaymentRemindersCandidate(businessId, unpaid, unpaidInvoiceIds),
      this.buildOptimizePricingCandidate(
        bId,
        currentMonthRevenue,
        futurePricedJobsCount,
        now,
      ),
    ].filter((c): c is SuggestionCandidate => c !== null);
  }

  private buildClientFollowUpsCandidate(
    business: Business,
    idleClients: IdleClient[],
  ): SuggestionCandidate | null {
    if (idleClients.length === 0) return null;

    const clientWord = idleClients.length === 1 ? 'client' : 'clients';
    const fingerprint = hashToken(
      `client-follow-ups:${idleClients
        .map((c) => c.clientId)
        .sort()
        .join(',')}`,
    );

    return {
      id: SuggestionId.CLIENT_FOLLOW_UPS,
      text: `Schedule follow-ups with ${idleClients.length} idle ${clientWord} to boost retention`,
      tag: SuggestionTag.QUICK_WIN,
      fingerprint,
      apply: () => {
        for (const client of idleClients) {
          void this.emailService
            .send({
              to: client.email,
              name: client.name,
              subject: `Just checking in — ${business.name}`,
              html: clientFollowUpTemplate(business.name, client.name),
            })
            .catch((err: unknown) =>
              this.logger.warn(
                `client-follow-ups: email failed [clientId=${client.clientId}]: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
        }
        return Promise.resolve(
          `Sent follow-up emails to ${idleClients.length} idle ${clientWord}.`,
        );
      },
    };
  }

  private buildCompleteStaleJobsCandidate(
    bId: Types.ObjectId,
    staleJobIds: Types.ObjectId[],
  ): SuggestionCandidate | null {
    if (staleJobIds.length === 0) return null;

    const jobWord = staleJobIds.length === 1 ? 'job' : 'jobs';
    const pronoun = staleJobIds.length === 1 ? 'it' : 'them';
    const fingerprint = hashToken(
      `complete-stale-jobs:${staleJobIds
        .map((id) => id.toString())
        .sort()
        .join(',')}`,
    );

    return {
      id: SuggestionId.COMPLETE_STALE_JOBS,
      text: `You have ${staleJobIds.length} ${jobWord} still in progress past their scheduled date — mark ${pronoun} as completed`,
      tag: SuggestionTag.SUGGESTED,
      fingerprint,
      apply: async () => {
        const updated = await this.aiSuggestionsRepository.completeJobs(
          bId,
          staleJobIds,
          new Date(),
        );
        return `Marked ${updated} ${updated === 1 ? 'job' : 'jobs'} as completed.`;
      },
    };
  }

  private buildRevenueTargetCandidate(
    business: Business,
    revenueTrend: MonthlyRevenuePoint[],
    now: Date,
  ): SuggestionCandidate | null {
    const nextMonth = this.nextMonthKey(now);
    if (business.revenueTargetMonth === nextMonth) return null;

    const withRevenue = revenueTrend.filter((point) => point.revenue > 0);
    if (withRevenue.length < 2) return null;

    const last = withRevenue[withRevenue.length - 1];
    const previous = withRevenue[withRevenue.length - 2];
    const growthRate = (last.revenue - previous.revenue) / previous.revenue;
    const forecast = toTwoDecimal(last.revenue * (1 + growthRate));
    if (forecast <= 0) return null;

    const fingerprint = hashToken(
      `set-revenue-target:${nextMonth}:${forecast}`,
    );

    return {
      id: SuggestionId.SET_REVENUE_TARGET,
      text: 'Set revenue targets for next month based on current trends',
      tag: SuggestionTag.HIGH_IMPACT,
      fingerprint,
      apply: async () => {
        await this.businessRepository.updateById(business._id.toString(), {
          revenueTargetMonth: nextMonth,
          revenueTargetAmount: forecast,
        });
        return `Set a ${this.formatCurrency(forecast)} revenue target for ${nextMonth}.`;
      },
    };
  }

  private buildPaymentRemindersCandidate(
    businessId: string,
    unpaid: UnpaidInvoicesSummary,
    unpaidInvoiceIds: Types.ObjectId[],
  ): SuggestionCandidate | null {
    if (unpaid.count === 0 || unpaidInvoiceIds.length === 0) return null;

    const invoiceWord = unpaid.count === 1 ? 'invoice' : 'invoices';
    const fingerprint = hashToken(
      `send-payment-reminders:${unpaidInvoiceIds
        .map((id) => id.toString())
        .sort()
        .join(',')}`,
    );

    return {
      id: SuggestionId.SEND_PAYMENT_REMINDERS,
      text: `Send payment reminders for ${unpaid.count} unpaid ${invoiceWord} totaling ${this.formatCurrency(unpaid.totalOutstanding)}`,
      tag: SuggestionTag.QUICK_WIN,
      fingerprint,
      apply: async () => {
        const results = await Promise.allSettled(
          unpaidInvoiceIds.map((invoiceId) =>
            this.invoicesService.sendInvoice(invoiceId.toString(), businessId),
          ),
        );
        const sent = results.filter((r) => r.status === 'fulfilled').length;
        return `Queued payment reminders for ${sent} of ${unpaidInvoiceIds.length} unpaid ${invoiceWord}.`;
      },
    };
  }

  private buildOptimizePricingCandidate(
    bId: Types.ObjectId,
    currentMonthRevenue: number,
    futurePricedJobsCount: number,
    now: Date,
  ): SuggestionCandidate | null {
    if (currentMonthRevenue <= 0 || futurePricedJobsCount === 0) return null;

    const boost = toTwoDecimal(
      currentMonthRevenue * (PRICE_INCREASE_PCT / 100),
    );
    const fingerprint = hashToken(
      `optimize-pricing:${currentMonthRevenue}:${futurePricedJobsCount}`,
    );

    return {
      id: SuggestionId.OPTIMIZE_PRICING,
      text: `Optimize service pricing — a ${PRICE_INCREASE_PCT}% increase could add ${this.formatCurrency(boost)}/month`,
      tag: SuggestionTag.HIGH_IMPACT,
      fingerprint,
      apply: async () => {
        const updated = await this.aiSuggestionsRepository.bumpFutureJobPrices(
          bId,
          now,
          PRICE_INCREASE_PCT,
        );
        return `Increased pricing by ${PRICE_INCREASE_PCT}% on ${updated} upcoming ${updated === 1 ? 'job' : 'jobs'}.`;
      },
    };
  }

  // ─── Resolved-suggestion tracking (applied or dismissed) ────────────────────

  private async filterUnresolved(
    businessId: string,
    candidates: SuggestionCandidate[],
  ): Promise<SuggestionCandidate[]> {
    const flags = await Promise.all(
      candidates.map((c) =>
        this.redisService.get(
          this.resolvedKey(businessId, c.id, c.fingerprint),
        ),
      ),
    );

    return candidates.filter((_, index) => !flags[index]);
  }

  private async markResolved(
    businessId: string,
    id: SuggestionId,
    fingerprint: string,
  ): Promise<void> {
    await this.redisService
      .set(
        this.resolvedKey(businessId, id, fingerprint),
        '1',
        CACHE_TTL.AI_SUGGESTION_RESOLVED,
      )
      .catch((err: unknown) =>
        this.logger.warn(
          `markResolved: cache write failed [businessId=${businessId}, id=${id}]: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  private resolvedKey(
    businessId: string,
    id: SuggestionId,
    fingerprint: string,
  ): string {
    return `${businessId}:ai:suggestions:resolved:${id}:${fingerprint}`;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private toSuggestion(candidate: SuggestionCandidate): Suggestion {
    return { id: candidate.id, text: candidate.text, tag: candidate.tag };
  }

  /** Starter/Growth cap suggestion volume; Pro is unlimited (Infinity → MAX_SAFE_INTEGER). */
  private suggestionLimit(plan: SubscriptionPlan): number {
    const max = PLAN_LIMITS[plan].maxAiSuggestions;
    return Number.isFinite(max) ? max : Number.MAX_SAFE_INTEGER;
  }

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

  /** Returns the first day of the month N months before `from` (UTC). */
  private monthStartNMonthsAgo(n: number, from: Date): Date {
    return new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - (n - 1), 1),
    );
  }

  /** Returns the "YYYY-MM" key for the calendar month after `now` (UTC). */
  private nextMonthKey(now: Date): string {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
