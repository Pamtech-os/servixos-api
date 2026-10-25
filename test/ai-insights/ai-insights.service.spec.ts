import { InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { AiInsightsRepository } from 'src/modules/ai-insights/repositories/ai-insights.repository';
import { AiInsightsService } from 'src/modules/ai-insights/services/ai-insights.service';
import {
  InsightCategory,
  InsightSeverity,
  JobCompletionStats,
  MonthlyRevenuePoint,
  PendingContractSummary,
  ProjectValueWindows,
  SchedulingClusterCandidate,
  UnpaidInvoicesSummary,
} from 'src/modules/ai-insights/types/ai-insights.types';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { asMock } from 'test/helpers/mock';

// ─── Anthropic mock ─────────────────────────────────────────────────────────
// The AI polish step is best-effort: tests control `mockCreate` to exercise
// both the success path (descriptions rewritten) and the failure/fallback
// path (deterministic template text is used untouched).
const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const bId = new Types.ObjectId().toString();

interface Metrics {
  unpaidInvoices: UnpaidInvoicesSummary;
  projectValue: ProjectValueWindows;
  revenueTrend: MonthlyRevenuePoint[];
  reengagementCount: number;
  topPendingContract: PendingContractSummary | null;
  schedulingCluster: SchedulingClusterCandidate | null;
  completionStats: JobCompletionStats;
  currentMonthRevenue: number;
}

const emptyMetrics: Metrics = {
  unpaidInvoices: { count: 0, totalOutstanding: 0 },
  projectValue: { currentAvg: 0, previousAvg: 0 },
  revenueTrend: [],
  reengagementCount: 0,
  topPendingContract: null,
  schedulingCluster: null,
  completionStats: { completed: 0, total: 0 },
  currentMonthRevenue: 0,
};

describe('AiInsightsService', () => {
  let service: AiInsightsService;
  let repository: {
    getUnpaidInvoicesSummary: jest.Mock;
    getProjectValueWindows: jest.Mock;
    getRecentMonthlyRevenue: jest.Mock;
    countReengagementClients: jest.Mock;
    getTopPendingContract: jest.Mock;
    getSchedulingClusterCandidate: jest.Mock;
    getJobCompletionStats: jest.Mock;
    getCurrentMonthRevenue: jest.Mock;
  };
  let redis: { get: jest.Mock; set: jest.Mock };
  let loggerErrorSpy: jest.SpyInstance;

  /** Wires the repository mocks from a flat metrics bag (see emptyMetrics). */
  function primeRepository(overrides: Partial<typeof emptyMetrics> = {}) {
    const m = { ...emptyMetrics, ...overrides };
    repository.getUnpaidInvoicesSummary.mockResolvedValue(m.unpaidInvoices);
    repository.getProjectValueWindows.mockResolvedValue(m.projectValue);
    repository.getRecentMonthlyRevenue.mockResolvedValue(m.revenueTrend);
    repository.countReengagementClients.mockResolvedValue(m.reengagementCount);
    repository.getTopPendingContract.mockResolvedValue(m.topPendingContract);
    repository.getSchedulingClusterCandidate.mockResolvedValue(
      m.schedulingCluster,
    );
    repository.getJobCompletionStats.mockResolvedValue(m.completionStats);
    repository.getCurrentMonthRevenue.mockResolvedValue(m.currentMonthRevenue);
  }

  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockRejectedValue(new Error('AI disabled in tests'));

    repository = {
      getUnpaidInvoicesSummary: jest.fn(),
      getProjectValueWindows: jest.fn(),
      getRecentMonthlyRevenue: jest.fn(),
      countReengagementClients: jest.fn(),
      getTopPendingContract: jest.fn(),
      getSchedulingClusterCandidate: jest.fn(),
      getJobCompletionStats: jest.fn(),
      getCurrentMonthRevenue: jest.fn(),
    };
    primeRepository();

    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const config = { get: jest.fn().mockReturnValue(undefined) };

    service = new AiInsightsService(
      asMock<ConfigService>(config),
      asMock<AiInsightsRepository>(repository),
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

  // ─── caching / token-usage cost controls ────────────────────────────────────
  //
  // Business metrics are read on every call (cheap, indexed aggregations) so
  // the service can compute a fingerprint of the *current* data. The AI is
  // only invoked when that fingerprint hasn't been seen before — i.e. the
  // underlying data actually changed. These tests assert that repeated
  // requests over unchanged data never re-invoke the AI, while a real data
  // change always triggers exactly one fresh call.

  describe('caching and AI token usage', () => {
    it('should re-read business metrics on every call to detect changes', async () => {
      // Arrange
      primeRepository({ unpaidInvoices: { count: 2, totalOutstanding: 500 } });

      // Act
      await service.generateInsights(bId, {});
      await service.generateInsights(bId, {});

      // Assert
      expect(repository.getUnpaidInvoicesSummary).toHaveBeenCalledTimes(2);
    });

    it('should key the cache by businessId and a data fingerprint', async () => {
      // Act
      await service.generateInsights(bId, {});

      // Assert
      expect(redis.get).toHaveBeenCalledWith(
        expect.stringContaining(`${bId}:ai:insights:`),
      );
    });

    it('should call the AI and cache the result on the first request for a given data set', async () => {
      // Arrange
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({}) }],
      });
      primeRepository({ unpaidInvoices: { count: 2, totalOutstanding: 500 } });

      // Act
      await service.generateInsights(bId, {});

      // Assert
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining(`${bId}:ai:insights:`),
        expect.any(String),
        CACHE_TTL.AI_INSIGHTS,
      );
    });

    it('should not call the AI again for a repeated request over unchanged data', async () => {
      // Arrange
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({}) }],
      });
      primeRepository({ unpaidInvoices: { count: 2, totalOutstanding: 500 } });

      let capturedCacheValue = '';
      redis.set.mockImplementation((_key: string, value: string) => {
        capturedCacheValue = value;
        return Promise.resolve(undefined);
      });

      // Act — first call: cache miss for this fingerprint, AI called
      const first = await service.generateInsights(bId, {});
      // Simulate the cache now holding what was just written for that fingerprint
      redis.get.mockResolvedValue(capturedCacheValue);
      const second = await service.generateInsights(bId, {});

      // Assert
      if (first instanceof InternalServerErrorException) throw first;
      if (second instanceof InternalServerErrorException) throw second;
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(second.insights).toEqual(first.insights);
    });

    it('should call the AI again when the underlying data has changed', async () => {
      // Arrange
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({}) }],
      });
      primeRepository({ unpaidInvoices: { count: 2, totalOutstanding: 500 } });

      // Act — first call
      await service.generateInsights(bId, {});
      // Data changes — a different unpaid-invoices total produces a different fingerprint
      primeRepository({ unpaidInvoices: { count: 5, totalOutstanding: 900 } });
      await service.generateInsights(bId, {});

      // Assert — a fresh AI call was made because the fingerprint changed
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should return InternalServerErrorException when the repository throws', async () => {
      // Arrange
      repository.getUnpaidInvoicesSummary.mockRejectedValue(
        new Error('db error'),
      );

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect((result as InternalServerErrorException).message).toBe(
        AI_MESSAGES.ERROR.INSIGHTS_FAILED,
      );
    });
  });

  // ─── category summaries + filtering ─────────────────────────────────────────

  describe('category summaries and filtering', () => {
    it('should return zero-count categories when no insight qualifies', async () => {
      // Arrange — all metrics empty/zero (default primeRepository())

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.insights).toHaveLength(0);
      expect(result.categories).toEqual([
        { key: InsightCategory.REVENUE, label: 'Revenue', count: 0 },
        { key: InsightCategory.CLIENTS, label: 'Clients', count: 0 },
        { key: InsightCategory.OPERATIONS, label: 'Operations', count: 0 },
        { key: InsightCategory.GROWTH, label: 'Growth', count: 0 },
      ]);
    });

    it('should count categories from the full set even when filtering by category', async () => {
      // Arrange
      primeRepository({
        unpaidInvoices: { count: 3, totalOutstanding: 1000 },
        currentMonthRevenue: 2000,
      });

      // Act
      const result = await service.generateInsights(bId, {
        category: InsightCategory.GROWTH,
      });

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const revenueCount = result.categories.find(
        (c) => c.key === InsightCategory.REVENUE,
      )?.count;
      expect(revenueCount).toBe(1); // unpaid invoices still counted
      expect(result.insights).toHaveLength(1);
      expect(result.insights[0].category).toBe(InsightCategory.GROWTH);
    });

    it('should filter by severity', async () => {
      // Arrange
      primeRepository({
        unpaidInvoices: { count: 1, totalOutstanding: 100 }, // high
        currentMonthRevenue: 500, // high (revenue-optimization)
      });

      // Act
      const result = await service.generateInsights(bId, {
        severity: InsightSeverity.LOW,
      });

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.insights).toHaveLength(0);
    });

    it('should sort the combined list with higher severities first', async () => {
      // Arrange — unpaid invoices is HIGH, scheduling efficiency is MEDIUM
      primeRepository({
        unpaidInvoices: { count: 1, totalOutstanding: 100 },
        schedulingCluster: { location: 'downtown', count: 4 },
      });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.insights[0].severity).toBe(InsightSeverity.HIGH);
      expect(result.insights[1].severity).toBe(InsightSeverity.MEDIUM);
    });
  });

  // ─── individual insight rules ───────────────────────────────────────────────

  describe('unpaid invoices insight', () => {
    it('should not appear when there are no unpaid invoices', async () => {
      // Arrange — default primeRepository() has count: 0

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(
        result.insights.find((i) => i.id === 'unpaid-invoices'),
      ).toBeUndefined();
    });

    it('should surface an unpaid-invoices card with the exact count and total', async () => {
      // Arrange
      primeRepository({
        unpaidInvoices: { count: 4, totalOutstanding: 11600 },
      });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find((i) => i.id === 'unpaid-invoices');
      expect(insight?.severity).toBe(InsightSeverity.HIGH);
      expect(insight?.description).toContain('4 unpaid invoices');
      expect(insight?.description).toContain('$11,600');
      expect(insight?.action?.link).toBe('/invoices?status=pending');
    });

    it('should use singular wording for exactly one unpaid invoice', async () => {
      // Arrange
      primeRepository({ unpaidInvoices: { count: 1, totalOutstanding: 200 } });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find((i) => i.id === 'unpaid-invoices');
      expect(insight?.description).toContain('1 unpaid invoice ');
    });
  });

  describe('average project value insight', () => {
    it('should not appear when either window has no invoices', async () => {
      // Arrange
      primeRepository({ projectValue: { currentAvg: 500, previousAvg: 0 } });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(
        result.insights.find((i) => i.id === 'average-project-value'),
      ).toBeUndefined();
    });

    it('should report an upward trend with the correct percentage', async () => {
      // Arrange — 4125 vs 3587 ≈ +15%
      primeRepository({
        projectValue: { currentAvg: 4125, previousAvg: 3587 },
      });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find(
        (i) => i.id === 'average-project-value',
      );
      expect(insight?.title).toBe('Average Project Value Up');
      expect(insight?.description).toContain('15% higher');
    });

    it('should report a downward trend', async () => {
      // Arrange — 3000 vs 4000 = -25%
      primeRepository({
        projectValue: { currentAvg: 3000, previousAvg: 4000 },
      });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find(
        (i) => i.id === 'average-project-value',
      );
      expect(insight?.title).toBe('Average Project Value Down');
      expect(insight?.description).toContain('25% lower');
    });
  });

  describe('cash flow forecast insight', () => {
    it('should not appear with fewer than two months of revenue', async () => {
      // Arrange
      primeRepository({
        revenueTrend: [{ month: '2026-06', revenue: 1000 }],
      });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(
        result.insights.find((i) => i.id === 'cash-flow-forecast'),
      ).toBeUndefined();
    });

    it('should project next month using the trailing growth rate', async () => {
      // Arrange — 20000 -> 21400 is a +7% growth rate, forecast ≈ 21400*1.07
      primeRepository({
        revenueTrend: [
          { month: '2026-05', revenue: 20000 },
          { month: '2026-06', revenue: 21400 },
        ],
      });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find(
        (i) => i.id === 'cash-flow-forecast',
      );
      expect(insight?.description).toContain('7% increase');
    });
  });

  describe('client re-engagement insight', () => {
    it('should not appear when no clients qualify', async () => {
      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(
        result.insights.find((i) => i.id === 'client-reengagement'),
      ).toBeUndefined();
    });

    it('should surface the count with an action link to clients', async () => {
      // Arrange
      primeRepository({ reengagementCount: 3 });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find(
        (i) => i.id === 'client-reengagement',
      );
      expect(insight?.description).toContain('3 completed clients');
      expect(insight?.action?.link).toBe('/clients');
    });
  });

  describe('top client at risk insight', () => {
    it('should not appear without a pending contract', async () => {
      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(
        result.insights.find((i) => i.id === 'top-client-at-risk'),
      ).toBeUndefined();
    });

    it('should name the client and the exact contract amount', async () => {
      // Arrange
      primeRepository({
        topPendingContract: { clientName: 'Olivia Davis', amount: 12000 },
      });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find(
        (i) => i.id === 'top-client-at-risk',
      );
      expect(insight?.description).toBe(
        'Olivia Davis has a pending contract worth $12,000. Follow up to secure the deal.',
      );
      expect(insight?.severity).toBe(InsightSeverity.HIGH);
    });
  });

  describe('scheduling efficiency insight', () => {
    it('should not appear without a scheduling cluster', async () => {
      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(
        result.insights.find((i) => i.id === 'scheduling-efficiency'),
      ).toBeUndefined();
    });

    it('should appear when a cluster candidate is returned', async () => {
      // Arrange
      primeRepository({
        schedulingCluster: { location: 'downtown', count: 3 },
      });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(
        result.insights.find((i) => i.id === 'scheduling-efficiency'),
      ).toBeDefined();
    });
  });

  describe('job completion rate insight', () => {
    it('should not appear when there are no jobs in the window', async () => {
      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(
        result.insights.find((i) => i.id === 'job-completion-rate'),
      ).toBeUndefined();
    });

    it('should mark a low completion rate as high severity', async () => {
      // Arrange — 4/10 = 40%
      primeRepository({ completionStats: { completed: 4, total: 10 } });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find(
        (i) => i.id === 'job-completion-rate',
      );
      expect(insight?.description).toContain('40%');
      expect(insight?.severity).toBe(InsightSeverity.HIGH);
    });

    it('should mark a mid-range completion rate as medium severity', async () => {
      // Arrange — 7/10 = 70%
      primeRepository({ completionStats: { completed: 7, total: 10 } });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find(
        (i) => i.id === 'job-completion-rate',
      );
      expect(insight?.severity).toBe(InsightSeverity.MEDIUM);
    });

    it('should mark a high completion rate as low severity', async () => {
      // Arrange — 9/10 = 90%
      primeRepository({ completionStats: { completed: 9, total: 10 } });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find(
        (i) => i.id === 'job-completion-rate',
      );
      expect(insight?.severity).toBe(InsightSeverity.LOW);
    });
  });

  describe('revenue optimization insight', () => {
    it('should not appear when there is no current-month revenue', async () => {
      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(
        result.insights.find((i) => i.id === 'revenue-optimization'),
      ).toBeUndefined();
    });

    it('should suggest a 10% price increase impact', async () => {
      // Arrange
      primeRepository({ currentMonthRevenue: 12400 });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find(
        (i) => i.id === 'revenue-optimization',
      );
      expect(insight?.description).toContain('$1,240');
      expect(insight?.severity).toBe(InsightSeverity.HIGH);
      expect(insight?.category).toBe(InsightCategory.GROWTH);
    });
  });

  // ─── AI polish ───────────────────────────────────────────────────────────────

  describe('AI description polish', () => {
    it('should fall back to the template description when the AI call fails', async () => {
      // Arrange
      mockCreate.mockRejectedValue(new Error('anthropic unavailable'));
      primeRepository({
        unpaidInvoices: { count: 2, totalOutstanding: 400 },
      });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find((i) => i.id === 'unpaid-invoices');
      expect(insight?.description).toContain('2 unpaid invoices');
    });

    it('should use the AI-rewritten description when the call succeeds', async () => {
      // Arrange
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              'unpaid-invoices':
                'Heads up — a few invoices still need chasing.',
            }),
          },
        ],
      });
      primeRepository({
        unpaidInvoices: { count: 2, totalOutstanding: 400 },
      });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find((i) => i.id === 'unpaid-invoices');
      expect(insight?.description).toBe(
        'Heads up — a few invoices still need chasing.',
      );
    });

    it('should ignore malformed AI output and keep the template description', async () => {
      // Arrange
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'not valid json at all' }],
      });
      primeRepository({
        unpaidInvoices: { count: 2, totalOutstanding: 400 },
      });

      // Act
      const result = await service.generateInsights(bId, {});

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      const insight = result.insights.find((i) => i.id === 'unpaid-invoices');
      expect(insight?.description).toContain('2 unpaid invoices');
    });
  });
});
