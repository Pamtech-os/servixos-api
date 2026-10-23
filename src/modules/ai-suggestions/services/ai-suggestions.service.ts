import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
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
import type { MonthlyRevenuePoint } from '../../ai-insights/types/ai-insights.types';
import { InvoiceStatus } from '../../invoices/schemas/invoice.schema';
import { InvoicesService } from '../../invoices/services/invoices.service';
import {
  AiSuggestionsRepository,
  type AiSuggestionContent,
  type AiSuggestionOutcomeUpdate,
  type AiSuggestionUpdate,
} from '../repositories/ai-suggestions.repository';
import {
  AiSuggestion,
  AiSuggestionExecution,
  AiSuggestionPayload,
} from '../schemas/ai-suggestion.schema';
import { AiSuggestionCopywriterService } from './ai-suggestion-copywriter.service';
import {
  DismissSuggestionResult,
  ExecuteSuggestionResult,
  IdleClient,
  InvoiceOutcomeRow,
  OverdueInvoice,
  Suggestion,
  SuggestionCategory,
  SuggestionCopy,
  SuggestionCopyRequest,
  SuggestionDetail,
  SuggestionKind,
  SuggestionsResult,
  SuggestionStatus,
  TrackedSuggestion,
  TrackedSuggestionsResult,
} from '../types/ai-suggestions.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const OVERDUE_INVOICE_LIMIT = 20;
const PAYMENT_HABIT_LOOKBACK_DAYS = 365;
const PAYMENT_GRACE_PERIOD_DAYS = 3;
const IDLE_CLIENT_THRESHOLD_DAYS = 30;
const IDLE_CLIENT_LIMIT = 10;
const PRICE_INCREASE_PCT = 10;
const REVENUE_TREND_MONTHS = 3;
const MAX_REPRICED_JOBS = 1000;
const MAX_TARGET_AMOUNT = 1_000_000_000_000;
const TRACKED_LIMIT = 50;

/** After being executed or dismissed, the same subject is not suggested again for this many days. */
const COOLDOWN_DAYS: Record<SuggestionKind, number> = {
  [SuggestionKind.PAYMENT_REMINDER]: 7,
  [SuggestionKind.CLIENT_FOLLOW_UP]: 30,
  [SuggestionKind.REVENUE_TARGET]: 31,
  [SuggestionKind.PRICE_INCREASE]: 30,
};

/** How long after execution we keep watching for a result before declaring "no result". */
const OUTCOME_WINDOW_DAYS = {
  PAYMENT: 30,
  FOLLOW_UP: 30,
  PRICING: 90,
} as const;

const CATEGORY_BY_KIND: Record<SuggestionKind, SuggestionCategory> = {
  [SuggestionKind.PAYMENT_REMINDER]: SuggestionCategory.CASH_FLOW,
  [SuggestionKind.REVENUE_TARGET]: SuggestionCategory.CASH_FLOW,
  [SuggestionKind.PRICE_INCREASE]: SuggestionCategory.PRICING,
  [SuggestionKind.CLIENT_FOLLOW_UP]: SuggestionCategory.CUSTOMER_RETENTION,
};

/** A suggestion computed from live business data, before persistence. */
interface Candidate {
  kind: SuggestionKind;
  dedupeKey: string;
  title: string;
  heading: string;
  details: SuggestionDetail[];
  /** Fixed value for numeric drafts; message drafts take their value from the copy. */
  draft?: { label: string; multiline: boolean; value?: string };
  executeLabel: string;
  successMessage: string;
  payload: AiSuggestionPayload;
  copy: SuggestionCopyRequest;
}

interface SelectedCandidate {
  candidate: Candidate;
  existing?: AiSuggestion;
  fingerprint: string;
}

interface PreparedExecution {
  run: () => Promise<{ execution: AiSuggestionExecution; outcome?: string }>;
}

interface EvaluatedOutcome {
  outcome: string | null;
  final: boolean;
}

/**
 * Generates actionable suggestions (cash flow, pricing, customer retention)
 * that the user reviews — optionally editing a draft — and executes.
 *
 * Design:
 * - Which suggestions apply, and every figure shown, is computed
 *   deterministically from business data. Claude only writes the human-voice
 *   copy (description, recommendation, draft message), via
 *   AiSuggestionCopywriterService, with a deterministic fallback.
 * - Each suggestion instance is persisted (`ai_suggestions`) so it has a
 *   unique id, its AI copy is generated once per data change rather than on
 *   every request, and executed suggestions can be tracked for outcomes.
 * - Executed/dismissed subjects stay hidden for a per-kind cooldown; when the
 *   underlying condition disappears (e.g. the invoice is paid) the active
 *   suggestion expires automatically.
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
    private readonly copywriter: AiSuggestionCopywriterService,
    private readonly invoicesService: InvoicesService,
    private readonly emailService: EmailService,
  ) {
    this.currency = config.get<string>('DEFAULT_CURRENCY') ?? 'USD';
  }

  /**
   * Returns the current suggestions for the business, capped by the plan's
   * `maxAiSuggestions` limit. New or changed suggestions get fresh AI copy.
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
      const now = new Date();
      const candidates = await this.buildCandidates(bId, business, now);
      const keys = candidates.map((c) => c.dedupeKey);

      const [latest] = await Promise.all([
        this.aiSuggestionsRepository.findLatestByKeys(bId, keys),
        this.aiSuggestionsRepository.expireActiveExcept(bId, keys, now),
      ]);
      // Hash map for O(1) lookup of each candidate's previous instance.
      const latestByKey = new Map(latest.map((doc) => [doc.dedupeKey, doc]));

      const selected = this.selectVisible(
        candidates,
        latestByKey,
        this.suggestionLimit(business.subscription.plan),
        now,
      );
      const docs = await this.persist(bId, selected);

      return {
        count: docs.length,
        suggestions: docs.map((doc) => this.toSuggestion(doc)),
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
   * Executes a suggestion's action — using the user's edited draft when one
   * is provided — and moves it to the tracked list.
   */
  async executeSuggestion(
    businessId: string,
    id: string,
    draftValue?: string,
  ): Promise<
    | ExecuteSuggestionResult
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const bId = new Types.ObjectId(businessId);
      const sId = new Types.ObjectId(id);
      const now = new Date();

      const doc = await this.aiSuggestionsRepository.findActiveById(bId, sId);
      if (!doc) {
        return new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND);
      }

      const draft = this.resolveDraft(doc, draftValue);
      if (draft instanceof BadRequestException) return draft;

      const prepared = await this.prepareExecution(
        bId,
        business,
        doc,
        draft,
        now,
      );
      if (prepared instanceof HttpException) return prepared;

      const claimed = await this.aiSuggestionsRepository.claim(
        bId,
        sId,
        SuggestionStatus.EXECUTED,
        now,
      );
      if (!claimed) {
        return new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND);
      }

      let result: Awaited<ReturnType<PreparedExecution['run']>>;
      try {
        result = await prepared.run();
      } catch (error) {
        await this.aiSuggestionsRepository.releaseClaim(bId, sId);
        this.logger.error(
          `executeSuggestion: action failed [businessId=${businessId}, id=${id}, kind=${doc.kind}]: ${error instanceof Error ? error.stack : String(error)}`,
        );
        return new InternalServerErrorException(
          AI_MESSAGES.ERROR.SUGGESTION_EXECUTE_FAILED,
        );
      }

      // The action already happened — a failed bookkeeping write must not report failure to the user.
      await this.aiSuggestionsRepository
        .recordExecution(bId, sId, result.execution, result.outcome)
        .catch((err: unknown) =>
          this.logger.warn(
            `executeSuggestion: recordExecution failed [businessId=${businessId}, id=${id}]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return {
        id,
        remaining: await this.remaining(bId, business),
        executedAt: now.toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `executeSuggestion: unexpected error [businessId=${businessId}, id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        AI_MESSAGES.ERROR.SUGGESTIONS_FAILED,
      );
    }
  }

  /** Dismisses a suggestion without executing it; the subject stays hidden for its cooldown. */
  async dismissSuggestion(
    businessId: string,
    id: string,
  ): Promise<
    DismissSuggestionResult | NotFoundException | InternalServerErrorException
  > {
    try {
      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const bId = new Types.ObjectId(businessId);
      const claimed = await this.aiSuggestionsRepository.claim(
        bId,
        new Types.ObjectId(id),
        SuggestionStatus.DISMISSED,
        new Date(),
      );
      if (!claimed) {
        return new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND);
      }

      return { id, remaining: await this.remaining(bId, business) };
    } catch (error) {
      this.logger.error(
        `dismissSuggestion: unexpected error [businessId=${businessId}, id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        AI_MESSAGES.ERROR.SUGGESTIONS_FAILED,
      );
    }
  }

  /**
   * Returns executed suggestions with their observed outcome (null while
   * pending). Outcomes are evaluated lazily and persisted once final.
   */
  async listTracked(
    businessId: string,
  ): Promise<TrackedSuggestionsResult | InternalServerErrorException> {
    try {
      const bId = new Types.ObjectId(businessId);
      const now = new Date();
      const docs = await this.aiSuggestionsRepository.findExecuted(
        bId,
        TRACKED_LIMIT,
      );

      const pending = docs.filter((doc) => !doc.outcomeFinal);
      const evaluated = await this.evaluateOutcomes(bId, pending, now);

      const updates: AiSuggestionOutcomeUpdate[] = [];
      for (const doc of pending) {
        const result = evaluated.get(doc._id.toString());
        if (
          result?.outcome &&
          (result.final || result.outcome !== doc.outcome)
        ) {
          updates.push({
            id: doc._id,
            outcome: result.outcome,
            outcomeFinal: result.final,
          });
        }
      }
      await this.aiSuggestionsRepository
        .saveOutcomes(bId, updates)
        .catch((err: unknown) =>
          this.logger.warn(
            `listTracked: saveOutcomes failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return {
        tracked: docs.map((doc) =>
          this.toTracked(
            doc,
            doc.outcomeFinal
              ? (doc.outcome ?? null)
              : (evaluated.get(doc._id.toString())?.outcome ?? null),
          ),
        ),
      };
    } catch (error) {
      this.logger.error(
        `listTracked: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        AI_MESSAGES.ERROR.SUGGESTIONS_FAILED,
      );
    }
  }

  // ─── Selection & persistence ────────────────────────────────────────────────

  /** Walks candidates in priority order, skipping subjects in cooldown, until the plan limit is reached. */
  private selectVisible(
    candidates: Candidate[],
    latestByKey: Map<string, AiSuggestion>,
    limit: number,
    now: Date,
  ): SelectedCandidate[] {
    const selected: SelectedCandidate[] = [];

    for (const candidate of candidates) {
      if (selected.length >= limit) break;

      const previous = latestByKey.get(candidate.dedupeKey);
      if (previous && this.isCoolingDown(previous, now)) continue;

      selected.push({
        candidate,
        existing:
          previous?.status === SuggestionStatus.ACTIVE ? previous : undefined,
        fingerprint: hashToken(
          JSON.stringify({ kind: candidate.kind, facts: candidate.copy.facts }),
        ),
      });
    }

    return selected;
  }

  /**
   * Creates new suggestions and refreshes changed ones. Claude is called once,
   * only for suggestions that are new or whose underlying facts changed.
   */
  private async persist(
    bId: Types.ObjectId,
    selected: SelectedCandidate[],
  ): Promise<AiSuggestion[]> {
    const needsCopy = selected.filter(
      (s) => !s.existing || s.existing.copyFingerprint !== s.fingerprint,
    );
    const copies = await this.copywriter.write(
      needsCopy.map((s) => s.candidate.copy),
    );

    const updates: AiSuggestionUpdate[] = [];
    const docs = await Promise.all(
      selected.map(async ({ candidate, existing, fingerprint }) => {
        const copy = copies.get(candidate.dedupeKey);

        if (!existing) {
          return this.aiSuggestionsRepository.insertActive(
            bId,
            candidate.dedupeKey,
            this.toContent(
              candidate,
              copy ?? candidate.copy.fallback,
              fingerprint,
            ),
          );
        }

        if (copy) {
          const content = this.toContent(candidate, copy, fingerprint);
          updates.push({ id: existing._id, set: content });
          return { ...existing, ...content };
        }

        // Same facts: keep the stored AI copy, refresh only the computed figures.
        const review = {
          ...this.toContent(candidate, candidate.copy.fallback, fingerprint)
            .review,
          draft: existing.review.draft,
        };
        if (this.renderChanged(existing, candidate)) {
          updates.push({
            id: existing._id,
            set: { title: candidate.title, review },
          });
        }
        return { ...existing, title: candidate.title, review };
      }),
    );

    await this.aiSuggestionsRepository.updateActive(bId, updates);
    return docs;
  }

  private toContent(
    candidate: Candidate,
    copy: SuggestionCopy,
    fingerprint: string,
  ): AiSuggestionContent {
    const draftValue =
      candidate.draft?.value ??
      copy.draftMessage ??
      candidate.copy.fallback.draftMessage;

    return {
      kind: candidate.kind,
      category: CATEGORY_BY_KIND[candidate.kind],
      copyFingerprint: fingerprint,
      title: candidate.title,
      description: copy.description,
      recommendation: copy.recommendation,
      review: {
        heading: candidate.heading,
        details: candidate.details,
        ...(candidate.draft && draftValue !== undefined
          ? {
              draft: {
                label: candidate.draft.label,
                value: draftValue,
                multiline: candidate.draft.multiline,
              },
            }
          : {}),
        executeLabel: candidate.executeLabel,
        successMessage: candidate.successMessage,
      },
      payload: candidate.payload,
    };
  }

  /** Whether the deterministic, display-only parts (title and review figures) differ from what is stored. */
  private renderChanged(existing: AiSuggestion, candidate: Candidate): boolean {
    const { review } = existing;
    return (
      existing.title !== candidate.title ||
      review.heading !== candidate.heading ||
      review.executeLabel !== candidate.executeLabel ||
      review.successMessage !== candidate.successMessage ||
      review.details.length !== candidate.details.length ||
      review.details.some(
        (detail, i) =>
          detail.label !== candidate.details[i].label ||
          detail.value !== candidate.details[i].value,
      )
    );
  }

  private isCoolingDown(previous: AiSuggestion, now: Date): boolean {
    if (
      previous.status !== SuggestionStatus.EXECUTED &&
      previous.status !== SuggestionStatus.DISMISSED
    ) {
      return false;
    }
    const resolvedAt = previous.resolvedAt ?? previous.updatedAt;
    if (!resolvedAt) return false;
    return (
      now.getTime() - new Date(resolvedAt).getTime() <
      COOLDOWN_DAYS[previous.kind] * MS_PER_DAY
    );
  }

  private async remaining(
    bId: Types.ObjectId,
    business: Business,
  ): Promise<number> {
    const active = await this.aiSuggestionsRepository.countActive(bId);
    return Math.min(active, this.suggestionLimit(business.subscription.plan));
  }

  // ─── Candidate computation ───────────────────────────────────────────────────

  private async buildCandidates(
    bId: Types.ObjectId,
    business: Business,
    now: Date,
  ): Promise<Candidate[]> {
    const [
      overdueInvoices,
      idleClients,
      futurePricedJobsCount,
      currentMonthRevenue,
      revenueTrend,
    ] = await Promise.all([
      this.aiSuggestionsRepository.getOverdueInvoices(
        bId,
        this.daysAgo(1, now),
        OVERDUE_INVOICE_LIMIT,
      ),
      this.aiSuggestionsRepository.getIdleClients(
        bId,
        this.daysAgo(IDLE_CLIENT_THRESHOLD_DAYS, now),
        IDLE_CLIENT_LIMIT,
      ),
      this.aiSuggestionsRepository.countFuturePricedJobs(bId, now),
      this.aiInsightsRepository.getCurrentMonthRevenue(bId),
      this.aiInsightsRepository.getRecentMonthlyRevenue(
        bId,
        this.monthStartNMonthsAgo(REVENUE_TREND_MONTHS, now),
      ),
    ]);

    // Hash map de-duplicates client ids in O(n) before the habits query.
    const clientIds = new Map(
      overdueInvoices.map((inv) => [inv.clientId.toString(), inv.clientId]),
    );
    const habits = await this.aiSuggestionsRepository.getClientPaymentHabits(
      bId,
      [...clientIds.values()],
      this.daysAgo(PAYMENT_HABIT_LOOKBACK_DAYS, now),
    );
    const habitByClient = new Map(
      habits.map((h) => [h.clientId.toString(), h.avgDaysToPay]),
    );

    const revenueTarget = this.buildRevenueTarget(business, revenueTrend, now);
    const priceIncrease = this.buildPriceIncrease(
      currentMonthRevenue,
      futurePricedJobsCount,
    );

    return this.interleave([
      overdueInvoices.map((inv) =>
        this.buildPaymentReminder(
          business,
          inv,
          habitByClient.get(inv.clientId.toString()),
          now,
        ),
      ),
      idleClients.map((client) =>
        this.buildClientFollowUp(business, client, now),
      ),
      priceIncrease ? [priceIncrease] : [],
      revenueTarget ? [revenueTarget] : [],
    ]);
  }

  /**
   * Round-robin merge, O(n): a plan's limited slots show a mix of categories
   * instead of, say, five payment reminders.
   */
  private interleave<T>(groups: T[][]): T[] {
    const merged: T[] = [];
    const longest = Math.max(0, ...groups.map((g) => g.length));
    for (let i = 0; i < longest; i++) {
      for (const group of groups) {
        if (i < group.length) merged.push(group[i]);
      }
    }
    return merged;
  }

  private buildPaymentReminder(
    business: Business,
    invoice: OverdueInvoice,
    avgDaysToPay: number | undefined,
    now: Date,
  ): Candidate {
    const amountDue = this.formatCurrency(
      toTwoDecimal(invoice.totalAmount - invoice.amountPaid),
    );
    const dueDate = this.formatDate(invoice.dueDate, business.timezone);
    const daysOverdue = Math.max(1, this.daysBetween(invoice.dueDate, now));
    const firstName = this.firstName(invoice.clientName);
    const habit =
      avgDaysToPay === undefined
        ? undefined
        : this.payHabitPhrase(avgDaysToPay);

    const details: SuggestionDetail[] = [
      { label: 'Customer', value: invoice.clientName },
      { label: 'Invoice', value: invoice.invoiceNumber },
      { label: 'Amount due', value: amountDue },
      { label: 'Due date', value: dueDate },
      { label: 'Days overdue', value: String(daysOverdue) },
    ];
    if (habit) details.push({ label: 'Usually pays', value: habit });

    return {
      kind: SuggestionKind.PAYMENT_REMINDER,
      dedupeKey: `${SuggestionKind.PAYMENT_REMINDER}:${invoice.invoiceId.toString()}`,
      title: `Invoice ${invoice.invoiceNumber} is ${daysOverdue} ${this.plural(daysOverdue, 'day')} overdue`,
      heading: 'Payment reminder',
      details,
      draft: { label: 'Reminder message', multiline: true },
      executeLabel: 'Send reminder',
      successMessage: `Payment reminder sent for Invoice ${invoice.invoiceNumber}.`,
      payload: { invoiceId: invoice.invoiceId },
      copy: {
        key: `${SuggestionKind.PAYMENT_REMINDER}:${invoice.invoiceId.toString()}`,
        kind: SuggestionKind.PAYMENT_REMINDER,
        wantsDraftMessage: true,
        facts: {
          businessName: business.name,
          customerName: invoice.clientName,
          invoiceNumber: invoice.invoiceNumber,
          amountDue,
          dueDate,
          suggestedGracePeriodDays: PAYMENT_GRACE_PERIOD_DAYS,
          ...(habit ? { customerUsuallyPays: habit } : {}),
        },
        fallback: {
          description: habit
            ? `${invoice.clientName} usually pays ${habit}, so this invoice is well past their normal pattern.`
            : `${amountDue} from ${invoice.clientName} is still outstanding.`,
          recommendation: `Send a friendly payment reminder with a ${PAYMENT_GRACE_PERIOD_DAYS}-day grace period.`,
          draftMessage: `Hi ${firstName},\n\nThis is a friendly reminder that invoice ${invoice.invoiceNumber} for ${amountDue} was due on ${dueDate}. If you've already sent payment, thank you, and please disregard this note. Otherwise, we'd appreciate payment within the next ${PAYMENT_GRACE_PERIOD_DAYS} days.\n\nThank you,\n${business.name}`,
        },
      },
    };
  }

  private buildClientFollowUp(
    business: Business,
    client: IdleClient,
    now: Date,
  ): Candidate {
    const idleDays = this.daysBetween(client.lastCompletedAt, now);
    const completedOn = this.formatDate(
      client.lastCompletedAt,
      business.timezone,
    );
    const firstName = this.firstName(client.name);
    const key = `${SuggestionKind.CLIENT_FOLLOW_UP}:${client.clientId.toString()}`;

    return {
      kind: SuggestionKind.CLIENT_FOLLOW_UP,
      dedupeKey: key,
      title: `${client.name} hasn't booked in ${idleDays} days`,
      heading: 'Client follow-up',
      details: [
        { label: 'Customer', value: client.name },
        { label: 'Email', value: client.email },
        { label: 'Last job', value: client.lastJobTitle },
        { label: 'Completed on', value: completedOn },
        { label: 'Jobs completed', value: String(client.completedJobs) },
      ],
      draft: { label: 'Follow-up message', multiline: true },
      executeLabel: 'Send follow-up',
      successMessage: `Follow-up sent to ${client.name}.`,
      payload: { clientId: client.clientId },
      copy: {
        key,
        kind: SuggestionKind.CLIENT_FOLLOW_UP,
        wantsDraftMessage: true,
        facts: {
          businessName: business.name,
          customerName: client.name,
          lastJobTitle: client.lastJobTitle,
          lastJobCompletedOn: completedOn,
          totalCompletedJobs: client.completedJobs,
        },
        fallback: {
          description:
            client.completedJobs > 1
              ? `${client.name} has completed ${client.completedJobs} jobs with you but hasn't booked since their ${client.lastJobTitle}.`
              : `${client.name} hasn't booked again since their ${client.lastJobTitle}.`,
          recommendation: 'Send a personal check-in email to invite them back.',
          draftMessage: `Hi ${firstName},\n\nIt's been a little while since we completed your ${client.lastJobTitle}. We'd love to help with anything new you have coming up. Just reply to this email and we'll get you scheduled.\n\nBest regards,\n${business.name}`,
        },
      },
    };
  }

  private buildRevenueTarget(
    business: Business,
    revenueTrend: MonthlyRevenuePoint[],
    now: Date,
  ): Candidate | null {
    const nextMonth = this.nextMonthKey(now);
    if (business.revenueTargetMonth === nextMonth) return null;

    const withRevenue = revenueTrend.filter((point) => point.revenue > 0);
    if (withRevenue.length < 2) return null;

    const last = withRevenue[withRevenue.length - 1];
    const previous = withRevenue[withRevenue.length - 2];
    const growthRate = (last.revenue - previous.revenue) / previous.revenue;
    const target = Math.round(last.revenue * (1 + growthRate));
    if (target <= 0) return null;

    const growthPct = Math.round(growthRate * 100);
    const change = `${growthPct >= 0 ? '+' : ''}${growthPct}%`;
    const targetLabel = this.formatCurrency(target);
    const monthLabel = this.formatMonth(nextMonth);
    const lastLabel = this.formatMonth(last.month);
    const previousLabel = this.formatMonth(previous.month);
    const key = `${SuggestionKind.REVENUE_TARGET}:${nextMonth}`;

    return {
      kind: SuggestionKind.REVENUE_TARGET,
      dedupeKey: key,
      title: `Set a ${targetLabel} revenue target for ${monthLabel}`,
      heading: 'Revenue target',
      details: [
        {
          label: `${lastLabel} revenue`,
          value: this.formatCurrency(last.revenue),
        },
        {
          label: `${previousLabel} revenue`,
          value: this.formatCurrency(previous.revenue),
        },
        { label: 'Month-over-month change', value: change },
        { label: 'Target month', value: monthLabel },
      ],
      draft: {
        label: `Target amount (${this.currency})`,
        multiline: false,
        value: String(target),
      },
      executeLabel: 'Set target',
      successMessage: `Revenue target for ${monthLabel} saved.`,
      payload: { targetMonth: nextMonth },
      copy: {
        key,
        kind: SuggestionKind.REVENUE_TARGET,
        wantsDraftMessage: false,
        facts: {
          targetMonth: monthLabel,
          lastMonth: lastLabel,
          lastMonthRevenue: this.formatCurrency(last.revenue),
          previousMonth: previousLabel,
          previousMonthRevenue: this.formatCurrency(previous.revenue),
          monthOverMonthChange: change,
          suggestedTarget: targetLabel,
        },
        fallback: {
          description: `Revenue changed ${change} from ${previousLabel} to ${lastLabel}. A target based on that trend keeps next month's goal visible.`,
          recommendation: `Set a ${targetLabel} revenue target for ${monthLabel}.`,
        },
      },
    };
  }

  private buildPriceIncrease(
    currentMonthRevenue: number,
    futurePricedJobsCount: number,
  ): Candidate | null {
    if (currentMonthRevenue <= 0 || futurePricedJobsCount === 0) return null;

    const boost = this.formatCurrency(
      toTwoDecimal(currentMonthRevenue * (PRICE_INCREASE_PCT / 100)),
    );
    const jobWord = this.plural(futurePricedJobsCount, 'job');

    return {
      kind: SuggestionKind.PRICE_INCREASE,
      dedupeKey: SuggestionKind.PRICE_INCREASE,
      title: `A ${PRICE_INCREASE_PCT}% price increase could add ${boost}/month`,
      heading: 'Price adjustment',
      details: [
        { label: 'Upcoming priced jobs', value: String(futurePricedJobsCount) },
        {
          label: 'Revenue this month',
          value: this.formatCurrency(currentMonthRevenue),
        },
        { label: 'Suggested increase', value: `${PRICE_INCREASE_PCT}%` },
        { label: 'Estimated added revenue', value: `${boost}/month` },
      ],
      draft: {
        label: 'Price increase (%)',
        multiline: false,
        value: String(PRICE_INCREASE_PCT),
      },
      executeLabel: 'Update prices',
      successMessage: 'Prices updated on upcoming jobs.',
      payload: {},
      copy: {
        key: SuggestionKind.PRICE_INCREASE,
        kind: SuggestionKind.PRICE_INCREASE,
        wantsDraftMessage: false,
        facts: {
          suggestedIncrease: `${PRICE_INCREASE_PCT}%`,
          upcomingPricedJobs: futurePricedJobsCount,
        },
        fallback: {
          description: `You have ${futurePricedJobsCount} upcoming priced ${jobWord}. Adjusting them before they start lifts revenue without touching completed work.`,
          recommendation: `Raise prices on upcoming jobs by ${PRICE_INCREASE_PCT}%.`,
        },
      },
    };
  }

  // ─── Execution ──────────────────────────────────────────────────────────────

  /**
   * The text the action will use: the user's edit when sent, otherwise the
   * stored draft. Undefined for suggestions without a draft.
   */
  private resolveDraft(
    doc: AiSuggestion,
    draftValue: string | undefined,
  ): string | undefined | BadRequestException {
    if (!doc.review.draft) return undefined;

    const value = (draftValue ?? doc.review.draft.value).trim();
    if (!value)
      return new BadRequestException(AI_MESSAGES.ERROR.DRAFT_REQUIRED);
    return value;
  }

  /**
   * Validates inputs and re-checks that the suggestion still applies, before
   * anything is claimed or mutated. Returns the action to run.
   */
  private async prepareExecution(
    bId: Types.ObjectId,
    business: Business,
    doc: AiSuggestion,
    draft: string | undefined,
    now: Date,
  ): Promise<PreparedExecution | NotFoundException | BadRequestException> {
    const businessId = bId.toString();

    switch (doc.kind) {
      case SuggestionKind.PAYMENT_REMINDER: {
        const invoiceId = doc.payload.invoiceId;
        const invoice = invoiceId
          ? await this.aiSuggestionsRepository.findUnpaidInvoice(bId, invoiceId)
          : null;
        if (!invoiceId || !invoice || !draft) {
          await this.aiSuggestionsRepository.expire(bId, doc._id, now);
          return new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND);
        }

        return {
          run: async () => {
            const sent = await this.invoicesService.sendInvoice(
              invoiceId.toString(),
              businessId,
              { reminderMessage: draft },
            );
            if (sent instanceof HttpException) throw sent;
            return {
              execution: {
                draftValue: draft,
                balanceDue: toTwoDecimal(
                  invoice.totalAmount - invoice.amountPaid,
                ),
                affectedJobIds: [],
              },
            };
          },
        };
      }

      case SuggestionKind.CLIENT_FOLLOW_UP: {
        const client = doc.payload.clientId
          ? await this.aiSuggestionsRepository.findActiveClient(
              bId,
              doc.payload.clientId,
            )
          : null;
        if (!client || !draft) {
          await this.aiSuggestionsRepository.expire(bId, doc._id, now);
          return new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND);
        }

        return {
          run: async () => {
            await this.emailService.send({
              to: client.email,
              name: client.name,
              subject: `Just checking in — ${business.name}`,
              html: clientFollowUpTemplate(business.name, client.name, draft),
            });
            return { execution: { draftValue: draft, affectedJobIds: [] } };
          },
        };
      }

      case SuggestionKind.REVENUE_TARGET: {
        const targetMonth = doc.payload.targetMonth;
        const amount = this.parseAmount(draft);
        if (amount === null) {
          return new BadRequestException(
            AI_MESSAGES.ERROR.TARGET_AMOUNT_INVALID,
          );
        }
        if (!targetMonth) {
          await this.aiSuggestionsRepository.expire(bId, doc._id, now);
          return new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND);
        }

        return {
          run: async () => {
            await this.businessRepository.updateById(businessId, {
              revenueTargetMonth: targetMonth,
              revenueTargetAmount: amount,
            });
            return {
              execution: {
                draftValue: draft,
                targetAmount: amount,
                affectedJobIds: [],
              },
            };
          },
        };
      }

      case SuggestionKind.PRICE_INCREASE: {
        const pct = this.parsePercent(draft);
        if (pct === null) {
          return new BadRequestException(
            AI_MESSAGES.ERROR.PRICE_INCREASE_INVALID,
          );
        }

        return {
          run: async () => {
            const jobIds =
              await this.aiSuggestionsRepository.findFuturePricedJobIds(
                bId,
                now,
                MAX_REPRICED_JOBS,
              );
            await this.aiSuggestionsRepository.bumpJobPrices(
              bId,
              jobIds,
              now,
              pct,
            );
            return {
              execution: {
                draftValue: draft,
                pricePct: pct,
                affectedJobIds: jobIds,
              },
              outcome:
                jobIds.length === 0
                  ? 'no upcoming jobs needed repricing.'
                  : undefined,
            };
          },
        };
      }

      default:
        return new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND);
    }
  }

  /** Accepts "12500", "12,500", "$12,500.50"; rejects negatives, zero and non-numbers. */
  private parseAmount(value: string | undefined): number | null {
    if (value === undefined) return null;
    const normalized = value.replace(/[\s,]/g, '').replace(/^[^\d.-]+/, '');
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

    const amount = toTwoDecimal(Number(normalized));
    return amount > 0 && amount <= MAX_TARGET_AMOUNT ? amount : null;
  }

  /** Accepts "10" or "10%"; must be in (0, 100]. */
  private parsePercent(value: string | undefined): number | null {
    if (value === undefined) return null;
    const normalized = value.replace(/[\s%]/g, '');
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

    const pct = toTwoDecimal(Number(normalized));
    return pct > 0 && pct <= 100 ? pct : null;
  }

  // ─── Outcome tracking ───────────────────────────────────────────────────────

  /**
   * Evaluates outcomes for not-yet-final tracked suggestions, batching the
   * reads per kind (one query for all invoices, one for all follow-ups).
   */
  private async evaluateOutcomes(
    bId: Types.ObjectId,
    docs: AiSuggestion[],
    now: Date,
  ): Promise<Map<string, EvaluatedOutcome>> {
    const results = new Map<string, EvaluatedOutcome>();
    if (docs.length === 0) return results;

    const reminders = docs.filter(
      (d) => d.kind === SuggestionKind.PAYMENT_REMINDER && d.payload.invoiceId,
    );
    const followUps = docs.filter(
      (d) =>
        d.kind === SuggestionKind.CLIENT_FOLLOW_UP &&
        d.payload.clientId &&
        d.executedAt,
    );
    const others = docs.filter(
      (d) =>
        d.kind === SuggestionKind.REVENUE_TARGET ||
        d.kind === SuggestionKind.PRICE_INCREASE,
    );

    const [invoiceRows, firstJobs, otherOutcomes] = await Promise.all([
      this.aiSuggestionsRepository.getInvoiceOutcomes(
        bId,
        reminders.map((d) => d.payload.invoiceId as Types.ObjectId),
      ),
      this.aiSuggestionsRepository.getFirstJobCreatedAfter(
        bId,
        followUps.map((d) => ({
          clientId: d.payload.clientId as Types.ObjectId,
          after: new Date(d.executedAt as Date),
        })),
      ),
      Promise.all(
        others.map(async (d) =>
          d.kind === SuggestionKind.REVENUE_TARGET
            ? this.revenueTargetOutcome(bId, d, now)
            : this.priceIncreaseOutcome(bId, d, now),
        ),
      ),
    ]);

    // Hash maps keyed by subject id for O(1) per-suggestion lookups.
    const invoiceById = new Map(
      invoiceRows.map((row) => [row.invoiceId.toString(), row]),
    );
    const firstJobByClient = new Map(
      firstJobs.map((row) => [row.clientId.toString(), row.firstCreatedAt]),
    );

    for (const doc of reminders) {
      results.set(
        doc._id.toString(),
        this.paymentReminderOutcome(
          doc,
          invoiceById.get((doc.payload.invoiceId as Types.ObjectId).toString()),
          now,
        ),
      );
    }
    for (const doc of followUps) {
      results.set(
        doc._id.toString(),
        this.followUpOutcome(
          doc,
          firstJobByClient.get(
            (doc.payload.clientId as Types.ObjectId).toString(),
          ),
          now,
        ),
      );
    }
    others.forEach((doc, index) =>
      results.set(doc._id.toString(), otherOutcomes[index]),
    );

    return results;
  }

  private paymentReminderOutcome(
    doc: AiSuggestion,
    row: InvoiceOutcomeRow | undefined,
    now: Date,
  ): EvaluatedOutcome {
    if (!row || row.deleted) {
      return { outcome: 'the invoice was deleted.', final: true };
    }

    const executedAt = this.executedAt(doc);
    if (row.status === InvoiceStatus.PAID) {
      if (!row.lastPaymentDate) {
        return { outcome: 'marked as paid.', final: true };
      }
      return {
        outcome: `paid ${this.laterPhrase(this.daysBetween(executedAt, row.lastPaymentDate))}.`,
        final: true,
      };
    }

    if (this.daysBetween(executedAt, now) >= OUTCOME_WINDOW_DAYS.PAYMENT) {
      return {
        outcome: `no payment received within ${OUTCOME_WINDOW_DAYS.PAYMENT} days.`,
        final: true,
      };
    }

    const balanceAtExecution = doc.execution?.balanceDue;
    const balanceNow = toTwoDecimal(row.totalAmount - row.amountPaid);
    if (balanceAtExecution !== undefined && balanceNow < balanceAtExecution) {
      return {
        outcome: `partially paid, ${this.formatCurrency(toTwoDecimal(balanceAtExecution - balanceNow))} received so far.`,
        final: false,
      };
    }

    return { outcome: null, final: false };
  }

  private followUpOutcome(
    doc: AiSuggestion,
    firstJobCreatedAt: Date | undefined,
    now: Date,
  ): EvaluatedOutcome {
    const executedAt = this.executedAt(doc);
    if (firstJobCreatedAt) {
      return {
        outcome: `booked a new job ${this.laterPhrase(this.daysBetween(executedAt, firstJobCreatedAt))}.`,
        final: true,
      };
    }
    if (this.daysBetween(executedAt, now) >= OUTCOME_WINDOW_DAYS.FOLLOW_UP) {
      return {
        outcome: `no new booking within ${OUTCOME_WINDOW_DAYS.FOLLOW_UP} days.`,
        final: true,
      };
    }
    return { outcome: null, final: false };
  }

  /** Final once the target month has ended; pending before that. */
  private async revenueTargetOutcome(
    bId: Types.ObjectId,
    doc: AiSuggestion,
    now: Date,
  ): Promise<EvaluatedOutcome> {
    const month = doc.payload.targetMonth;
    const target = doc.execution?.targetAmount;
    if (!month || !target) return { outcome: null, final: false };

    const [year, monthNum] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthNum - 1, 1));
    const end = new Date(Date.UTC(year, monthNum, 1));
    if (now < end) return { outcome: null, final: false };

    const actual = toTwoDecimal(
      await this.aiSuggestionsRepository.sumRevenueBetween(bId, start, end),
    );
    const pct = Math.round((actual / target) * 100);
    return {
      outcome: `reached ${this.formatCurrency(actual)} of the ${this.formatCurrency(target)} target (${pct}%).`,
      final: true,
    };
  }

  /** Progress of the repriced jobs; final when all are settled or the window has passed. */
  private async priceIncreaseOutcome(
    bId: Types.ObjectId,
    doc: AiSuggestion,
    now: Date,
  ): Promise<EvaluatedOutcome> {
    const jobIds = doc.execution?.affectedJobIds ?? [];
    if (!doc.execution) return { outcome: null, final: false };
    if (jobIds.length === 0) {
      return { outcome: 'no upcoming jobs needed repricing.', final: true };
    }

    const { completed, cancelled } =
      await this.aiSuggestionsRepository.getJobStatusCounts(bId, jobIds);
    const settled = completed + cancelled;
    const windowPassed =
      this.daysBetween(this.executedAt(doc), now) >=
      OUTCOME_WINDOW_DAYS.PRICING;
    if (settled === 0 && !windowPassed) return { outcome: null, final: false };

    const final = settled >= jobIds.length || windowPassed;
    const cancelledPart = cancelled > 0 ? `, ${cancelled} cancelled` : '';
    return {
      outcome: `${completed} of ${jobIds.length} repriced ${this.plural(jobIds.length, 'job')} completed${final ? ' at the new price' : ' so far'}${cancelledPart}.`,
      final,
    };
  }

  // ─── Mapping ─────────────────────────────────────────────────────────────────

  private toSuggestion(doc: AiSuggestion): Suggestion {
    const { heading, details, draft, executeLabel, successMessage } =
      doc.review;

    return {
      id: doc._id.toString(),
      category: doc.category,
      title: doc.title,
      description: doc.description,
      recommendation: doc.recommendation,
      review: {
        heading,
        details: details.map(({ label, value }) => ({ label, value })),
        ...(draft
          ? {
              draft: {
                label: draft.label,
                value: draft.value,
                multiline: draft.multiline,
              },
            }
          : {}),
        executeLabel,
        successMessage,
      },
    };
  }

  private toTracked(
    doc: AiSuggestion,
    outcome: string | null,
  ): TrackedSuggestion {
    return {
      id: doc._id.toString(),
      category: doc.category,
      title: doc.title,
      executeLabel: doc.review.executeLabel,
      executedAt: this.executedAt(doc).toISOString(),
      outcome,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Starter/Growth cap suggestion volume; Pro is unlimited (Infinity → MAX_SAFE_INTEGER). */
  private suggestionLimit(plan: SubscriptionPlan): number {
    const max = PLAN_LIMITS[plan].maxAiSuggestions;
    return Number.isFinite(max) ? max : Number.MAX_SAFE_INTEGER;
  }

  private executedAt(doc: AiSuggestion): Date {
    return new Date(doc.executedAt ?? doc.resolvedAt ?? doc.updatedAt ?? 0);
  }

  /** Whole days from `from` to `to`, never negative (payment dates are often stored as midnight). */
  private daysBetween(from: Date, to: Date): number {
    return Math.max(
      0,
      Math.floor(
        (new Date(to).getTime() - new Date(from).getTime()) / MS_PER_DAY,
      ),
    );
  }

  private laterPhrase(days: number): string {
    return days === 0
      ? 'the same day'
      : `${days} ${this.plural(days, 'day')} later`;
  }

  private payHabitPhrase(avgDays: number): string {
    return avgDays <= 0
      ? 'on the day they are invoiced'
      : `within ${avgDays} ${this.plural(avgDays, 'day')}`;
  }

  private plural(count: number, word: string): string {
    return count === 1 ? word : `${word}s`;
  }

  private firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  }

  /** Formats a stored UTC date as a business-local calendar date, e.g. "Oct 11, 2026". */
  private formatDate(date: Date, timezone: string | undefined): string {
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    };
    try {
      return new Intl.DateTimeFormat('en-US', {
        ...options,
        timeZone: timezone || 'UTC',
      }).format(new Date(date));
    } catch {
      return new Intl.DateTimeFormat('en-US', {
        ...options,
        timeZone: 'UTC',
      }).format(new Date(date));
    }
  }

  /** "2026-11" → "November 2026". */
  private formatMonth(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }

  private daysAgo(days: number, from: Date): Date {
    return new Date(from.getTime() - days * MS_PER_DAY);
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
