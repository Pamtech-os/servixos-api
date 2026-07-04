import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import {
  Business,
  SubscriptionPlan,
} from 'src/modules/business/schemas/business.schema';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { AiInsightsRepository } from 'src/modules/ai-insights/repositories/ai-insights.repository';
import type {
  MonthlyRevenuePoint,
  UnpaidInvoicesSummary,
} from 'src/modules/ai-insights/types/ai-insights.types';
import { InvoicesService } from 'src/modules/invoices/services/invoices.service';
import { EmailService } from 'src/modules/email/services/email.service';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { AiSuggestionsRepository } from 'src/modules/ai-suggestions/repositories/ai-suggestions.repository';
import { AiSuggestionsService } from 'src/modules/ai-suggestions/services/ai-suggestions.service';
import {
  IdleClient,
  SuggestionId,
  SuggestionTag,
} from 'src/modules/ai-suggestions/types/ai-suggestions.types';
import { asMock } from 'test/helpers/mock';

const BID = new Types.ObjectId().toString();

interface Data {
  idleClients: IdleClient[];
  staleJobIds: Types.ObjectId[];
  unpaidSummary: UnpaidInvoicesSummary;
  unpaidInvoiceIds: Types.ObjectId[];
  futurePricedJobsCount: number;
  currentMonthRevenue: number;
  revenueTrend: MonthlyRevenuePoint[];
}

const emptyData: Data = {
  idleClients: [],
  staleJobIds: [],
  unpaidSummary: { count: 0, totalOutstanding: 0 },
  unpaidInvoiceIds: [],
  futurePricedJobsCount: 0,
  currentMonthRevenue: 0,
  revenueTrend: [],
};

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    _id: new Types.ObjectId(BID),
    name: 'Acme Services',
    subscription: { plan: SubscriptionPlan.PRO } as Business['subscription'],
    revenueTargetMonth: undefined,
    revenueTargetAmount: undefined,
    deletedAt: undefined,
    ...overrides,
  } as Business;
}

describe('AiSuggestionsService', () => {
  let service: AiSuggestionsService;
  let businessRepo: { findById: jest.Mock; updateById: jest.Mock };
  let insightsRepo: {
    getUnpaidInvoicesSummary: jest.Mock;
    getCurrentMonthRevenue: jest.Mock;
    getRecentMonthlyRevenue: jest.Mock;
  };
  let suggestionsRepo: {
    getIdleClients: jest.Mock;
    findStaleInProgressJobIds: jest.Mock;
    completeJobs: jest.Mock;
    getUnpaidInvoiceIds: jest.Mock;
    countFuturePricedJobs: jest.Mock;
    bumpFutureJobPrices: jest.Mock;
  };
  let invoicesService: { sendInvoice: jest.Mock };
  let emailService: { send: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock };
  let resolvedKeys: Set<string>;
  let loggerErrorSpy: jest.SpyInstance;

  /** Wires the repository mocks from a flat data bag (see emptyData). */
  function primeData(overrides: Partial<Data> = {}) {
    const d = { ...emptyData, ...overrides };
    suggestionsRepo.getIdleClients.mockResolvedValue(d.idleClients);
    suggestionsRepo.findStaleInProgressJobIds.mockResolvedValue(d.staleJobIds);
    insightsRepo.getUnpaidInvoicesSummary.mockResolvedValue(d.unpaidSummary);
    suggestionsRepo.getUnpaidInvoiceIds.mockResolvedValue(d.unpaidInvoiceIds);
    suggestionsRepo.countFuturePricedJobs.mockResolvedValue(
      d.futurePricedJobsCount,
    );
    insightsRepo.getCurrentMonthRevenue.mockResolvedValue(
      d.currentMonthRevenue,
    );
    insightsRepo.getRecentMonthlyRevenue.mockResolvedValue(d.revenueTrend);
  }

  beforeEach(() => {
    businessRepo = {
      findById: jest.fn().mockResolvedValue(makeBusiness()),
      updateById: jest.fn().mockResolvedValue(undefined),
    };
    insightsRepo = {
      getUnpaidInvoicesSummary: jest.fn(),
      getCurrentMonthRevenue: jest.fn(),
      getRecentMonthlyRevenue: jest.fn(),
    };
    suggestionsRepo = {
      getIdleClients: jest.fn(),
      findStaleInProgressJobIds: jest.fn(),
      completeJobs: jest.fn().mockResolvedValue(0),
      getUnpaidInvoiceIds: jest.fn(),
      countFuturePricedJobs: jest.fn(),
      bumpFutureJobPrices: jest.fn().mockResolvedValue(0),
    };
    primeData();

    invoicesService = {
      sendInvoice: jest.fn().mockResolvedValue({ queued: true }),
    };
    emailService = { send: jest.fn().mockResolvedValue(undefined) };

    resolvedKeys = new Set<string>();
    redis = {
      get: jest.fn((key: string) =>
        Promise.resolve(resolvedKeys.has(key) ? '1' : null),
      ),
      set: jest.fn((key: string) => {
        resolvedKeys.add(key);
        return Promise.resolve(undefined);
      }),
    };

    const config = { get: jest.fn().mockReturnValue(undefined) };

    service = new AiSuggestionsService(
      asMock<ConfigService>(config),
      asMock<BusinessRepository>(businessRepo),
      asMock<AiInsightsRepository>(insightsRepo),
      asMock<AiSuggestionsRepository>(suggestionsRepo),
      asMock<InvoicesService>(invoicesService),
      asMock<EmailService>(emailService),
      asMock<RedisService>(redis),
    );

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  // ─── listSuggestions ────────────────────────────────────────────────────────

  describe('listSuggestions', () => {
    it('should return an empty list when nothing qualifies', async () => {
      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      if (result instanceof Error) throw result;
      expect(result.count).toBe(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should return NotFoundException when the business does not exist', async () => {
      // Arrange
      businessRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        COMMON_MESSAGES.ERROR.NOT_FOUND,
      );
    });

    it('should return InternalServerErrorException when a repository call throws', async () => {
      // Arrange
      suggestionsRepo.getIdleClients.mockRejectedValue(new Error('db error'));

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect((result as InternalServerErrorException).message).toBe(
        AI_MESSAGES.ERROR.SUGGESTIONS_FAILED,
      );
    });

    it('should surface a client-follow-ups suggestion tagged as a quick win', async () => {
      // Arrange
      primeData({
        idleClients: [
          { clientId: '1', name: 'Jane', email: 'jane@example.com' },
          { clientId: '2', name: 'Sam', email: 'sam@example.com' },
        ],
      });

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      if (result instanceof Error) throw result;
      const suggestion = result.suggestions.find(
        (s) => s.id === SuggestionId.CLIENT_FOLLOW_UPS,
      );
      expect(suggestion?.text).toContain('2 idle clients');
      expect(suggestion?.tag).toBe(SuggestionTag.QUICK_WIN);
    });

    it('should surface a complete-stale-jobs suggestion tagged as suggested', async () => {
      // Arrange
      primeData({ staleJobIds: [new Types.ObjectId(), new Types.ObjectId()] });

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      if (result instanceof Error) throw result;
      const suggestion = result.suggestions.find(
        (s) => s.id === SuggestionId.COMPLETE_STALE_JOBS,
      );
      expect(suggestion?.text).toContain('2 jobs');
      expect(suggestion?.tag).toBe(SuggestionTag.SUGGESTED);
    });

    it('should surface a send-payment-reminders suggestion with the exact totals', async () => {
      // Arrange
      primeData({
        unpaidSummary: { count: 4, totalOutstanding: 11600 },
        unpaidInvoiceIds: [new Types.ObjectId()],
      });

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      if (result instanceof Error) throw result;
      const suggestion = result.suggestions.find(
        (s) => s.id === SuggestionId.SEND_PAYMENT_REMINDERS,
      );
      expect(suggestion?.text).toContain('4 unpaid invoices totaling $11,600');
      expect(suggestion?.tag).toBe(SuggestionTag.QUICK_WIN);
    });

    it('should surface an optimize-pricing suggestion with the exact monthly boost', async () => {
      // Arrange
      primeData({ currentMonthRevenue: 12400, futurePricedJobsCount: 3 });

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      if (result instanceof Error) throw result;
      const suggestion = result.suggestions.find(
        (s) => s.id === SuggestionId.OPTIMIZE_PRICING,
      );
      expect(suggestion?.text).toContain('$1,240/month');
      expect(suggestion?.tag).toBe(SuggestionTag.HIGH_IMPACT);
    });

    it('should not surface optimize-pricing when there are no upcoming priced jobs', async () => {
      // Arrange
      primeData({ currentMonthRevenue: 12400, futurePricedJobsCount: 0 });

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      if (result instanceof Error) throw result;
      expect(
        result.suggestions.find((s) => s.id === SuggestionId.OPTIMIZE_PRICING),
      ).toBeUndefined();
    });

    it('should surface a set-revenue-target suggestion based on the trailing growth rate', async () => {
      // Arrange — 20000 -> 21400 is a growth trend; forecast should be >0
      primeData({
        revenueTrend: [
          { month: '2026-05', revenue: 20000 },
          { month: '2026-06', revenue: 21400 },
        ],
      });

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      if (result instanceof Error) throw result;
      expect(
        result.suggestions.find(
          (s) => s.id === SuggestionId.SET_REVENUE_TARGET,
        ),
      ).toBeDefined();
    });

    it('should not surface set-revenue-target when a target is already set for next month', async () => {
      // Arrange
      const now = new Date();
      const nextMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      );
      const nextMonthKey = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}`;
      businessRepo.findById.mockResolvedValue(
        makeBusiness({ revenueTargetMonth: nextMonthKey }),
      );
      primeData({
        revenueTrend: [
          { month: '2026-05', revenue: 20000 },
          { month: '2026-06', revenue: 21400 },
        ],
      });

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      if (result instanceof Error) throw result;
      expect(
        result.suggestions.find(
          (s) => s.id === SuggestionId.SET_REVENUE_TARGET,
        ),
      ).toBeUndefined();
    });
  });

  // ─── applySuggestion ────────────────────────────────────────────────────────

  describe('applySuggestion', () => {
    it('should return NotFoundException when the business does not exist', async () => {
      // Arrange
      businessRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.applySuggestion(
        BID,
        SuggestionId.OPTIMIZE_PRICING,
      );

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should return NotFoundException when the suggestion is not currently applicable', async () => {
      // Arrange — nothing primed, so no candidate qualifies

      // Act
      const result = await service.applySuggestion(
        BID,
        SuggestionId.OPTIMIZE_PRICING,
      );

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND,
      );
    });

    it('should send a follow-up email to every idle client and report the count', async () => {
      // Arrange
      primeData({
        idleClients: [
          { clientId: '1', name: 'Jane', email: 'jane@example.com' },
          { clientId: '2', name: 'Sam', email: 'sam@example.com' },
        ],
      });

      // Act
      const result = await service.applySuggestion(
        BID,
        SuggestionId.CLIENT_FOLLOW_UPS,
      );

      // Assert
      if (result instanceof Error) throw result;
      expect(emailService.send).toHaveBeenCalledTimes(2);
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'jane@example.com' }),
      );
      expect(result.summary).toContain('2 idle clients');
    });

    it('should complete the stale jobs via the repository', async () => {
      // Arrange
      const jobIds = [new Types.ObjectId(), new Types.ObjectId()];
      primeData({ staleJobIds: jobIds });
      suggestionsRepo.completeJobs.mockResolvedValue(2);

      // Act
      const result = await service.applySuggestion(
        BID,
        SuggestionId.COMPLETE_STALE_JOBS,
      );

      // Assert
      if (result instanceof Error) throw result;
      expect(suggestionsRepo.completeJobs).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        jobIds,
        expect.any(Date),
      );
      expect(result.summary).toContain('Marked 2 jobs as completed');
    });

    it('should persist the forecasted revenue target on the business', async () => {
      // Arrange
      primeData({
        revenueTrend: [
          { month: '2026-05', revenue: 20000 },
          { month: '2026-06', revenue: 21400 },
        ],
      });

      // Act
      const result = await service.applySuggestion(
        BID,
        SuggestionId.SET_REVENUE_TARGET,
      );

      // Assert
      if (result instanceof Error) throw result;
      expect(businessRepo.updateById).toHaveBeenCalledTimes(1);
      const [calledBusinessId, update] = businessRepo.updateById.mock
        .calls[0] as [
        string,
        { revenueTargetMonth: string; revenueTargetAmount: number },
      ];
      expect(calledBusinessId).toBe(BID);
      expect(typeof update.revenueTargetMonth).toBe('string');
      expect(typeof update.revenueTargetAmount).toBe('number');
    });

    it('should queue a reminder for every unpaid invoice', async () => {
      // Arrange
      const invoiceIds = [new Types.ObjectId(), new Types.ObjectId()];
      primeData({
        unpaidSummary: { count: 2, totalOutstanding: 800 },
        unpaidInvoiceIds: invoiceIds,
      });

      // Act
      const result = await service.applySuggestion(
        BID,
        SuggestionId.SEND_PAYMENT_REMINDERS,
      );

      // Assert
      if (result instanceof Error) throw result;
      expect(invoicesService.sendInvoice).toHaveBeenCalledTimes(2);
      expect(invoicesService.sendInvoice).toHaveBeenCalledWith(
        invoiceIds[0].toString(),
        BID,
      );
      expect(result.summary).toContain('Queued payment reminders for 2 of 2');
    });

    it('should not let one failed reminder block the others', async () => {
      // Arrange
      const invoiceIds = [new Types.ObjectId(), new Types.ObjectId()];
      primeData({
        unpaidSummary: { count: 2, totalOutstanding: 800 },
        unpaidInvoiceIds: invoiceIds,
      });
      invoicesService.sendInvoice
        .mockResolvedValueOnce({ queued: true })
        .mockRejectedValueOnce(new Error('email provider down'));

      // Act
      const result = await service.applySuggestion(
        BID,
        SuggestionId.SEND_PAYMENT_REMINDERS,
      );

      // Assert
      if (result instanceof Error) throw result;
      expect(result.summary).toContain('Queued payment reminders for 1 of 2');
    });

    it('should bump the price of upcoming jobs via the repository', async () => {
      // Arrange
      primeData({ currentMonthRevenue: 12400, futurePricedJobsCount: 3 });
      suggestionsRepo.bumpFutureJobPrices.mockResolvedValue(3);

      // Act
      const result = await service.applySuggestion(
        BID,
        SuggestionId.OPTIMIZE_PRICING,
      );

      // Assert
      if (result instanceof Error) throw result;
      expect(suggestionsRepo.bumpFutureJobPrices).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.any(Date),
        10,
      );
      expect(result.summary).toContain('Increased pricing by 10% on 3');
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      primeData({ currentMonthRevenue: 12400, futurePricedJobsCount: 3 });
      suggestionsRepo.bumpFutureJobPrices.mockRejectedValue(
        new Error('db crash'),
      );

      // Act
      const result = await service.applySuggestion(
        BID,
        SuggestionId.OPTIMIZE_PRICING,
      );

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });

    // ─── the core product requirement: "list becomes less" ──────────────────

    it('should make the applied suggestion disappear from a subsequent list call', async () => {
      // Arrange
      primeData({ currentMonthRevenue: 12400, futurePricedJobsCount: 3 });

      // Act
      const before = await service.listSuggestions(BID);
      await service.applySuggestion(BID, SuggestionId.OPTIMIZE_PRICING);
      const after = await service.listSuggestions(BID);

      // Assert
      if (before instanceof Error) throw before;
      if (after instanceof Error) throw after;
      expect(
        before.suggestions.some((s) => s.id === SuggestionId.OPTIMIZE_PRICING),
      ).toBe(true);
      expect(
        after.suggestions.some((s) => s.id === SuggestionId.OPTIMIZE_PRICING),
      ).toBe(false);
      expect(after.count).toBeLessThan(before.count);
    });

    it('should surface the suggestion again once the underlying data changes', async () => {
      // Arrange — apply for one set of unpaid invoices
      const firstBatch = [new Types.ObjectId()];
      primeData({
        unpaidSummary: { count: 1, totalOutstanding: 300 },
        unpaidInvoiceIds: firstBatch,
      });
      await service.applySuggestion(BID, SuggestionId.SEND_PAYMENT_REMINDERS);

      // Act — a new, different unpaid invoice appears later
      const secondBatch = [new Types.ObjectId()];
      primeData({
        unpaidSummary: { count: 1, totalOutstanding: 500 },
        unpaidInvoiceIds: secondBatch,
      });
      const result = await service.listSuggestions(BID);

      // Assert — the suggestion reappears because the fingerprint differs
      if (result instanceof Error) throw result;
      expect(
        result.suggestions.some(
          (s) => s.id === SuggestionId.SEND_PAYMENT_REMINDERS,
        ),
      ).toBe(true);
    });
  });

  // ─── dismissSuggestion ──────────────────────────────────────────────────────

  describe('dismissSuggestion', () => {
    it('should return NotFoundException when the suggestion is not currently applicable', async () => {
      // Act
      const result = await service.dismissSuggestion(
        BID,
        SuggestionId.CLIENT_FOLLOW_UPS,
      );

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should hide the suggestion without performing its mutation', async () => {
      // Arrange
      primeData({
        idleClients: [
          { clientId: '1', name: 'Jane', email: 'jane@example.com' },
        ],
      });

      // Act
      const result = await service.dismissSuggestion(
        BID,
        SuggestionId.CLIENT_FOLLOW_UPS,
      );

      // Assert
      if (result instanceof Error) throw result;
      expect(emailService.send).not.toHaveBeenCalled();

      const after = await service.listSuggestions(BID);
      if (after instanceof Error) throw after;
      expect(
        after.suggestions.some((s) => s.id === SuggestionId.CLIENT_FOLLOW_UPS),
      ).toBe(false);
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      primeData({
        idleClients: [
          { clientId: '1', name: 'Jane', email: 'jane@example.com' },
        ],
      });
      redis.set.mockImplementation(() => {
        throw new Error('redis down');
      });

      // Act
      const result = await service.dismissSuggestion(
        BID,
        SuggestionId.CLIENT_FOLLOW_UPS,
      );

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── plan-based suggestion cap ──────────────────────────────────────────────

  describe('plan-based suggestion cap', () => {
    it('should show all eligible suggestions for a Starter business when 5 or fewer qualify', async () => {
      // Arrange — Starter's maxAiSuggestions is exactly 5, matching all 5 suggestion types
      businessRepo.findById.mockResolvedValue(
        makeBusiness({
          subscription: {
            plan: SubscriptionPlan.STARTER,
          } as Business['subscription'],
        }),
      );
      primeData({
        idleClients: [
          { clientId: '1', name: 'Jane', email: 'jane@example.com' },
        ],
        staleJobIds: [new Types.ObjectId()],
        unpaidSummary: { count: 4, totalOutstanding: 11600 },
        unpaidInvoiceIds: [new Types.ObjectId()],
        futurePricedJobsCount: 3,
        currentMonthRevenue: 12400,
        revenueTrend: [
          { month: '2026-05', revenue: 20000 },
          { month: '2026-06', revenue: 21400 },
        ],
      });

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      if (result instanceof Error) throw result;
      expect(result.count).toBe(5);
      expect(result.suggestions).toHaveLength(5);
    });
  });
});
