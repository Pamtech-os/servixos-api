import { InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { AiInsightsRepository } from 'src/modules/ai-insights/repositories/ai-insights.repository';
import { AiAdvisorRepository } from 'src/modules/ai-advisor/repositories/ai-advisor.repository';
import { AiAdvisorService } from 'src/modules/ai-advisor/services/ai-advisor.service';
import { AdvisorTopic } from 'src/modules/ai-advisor/types/ai-advisor.types';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { asMock } from 'test/helpers/mock';

// ─── Anthropic mock ─────────────────────────────────────────────────────────
const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const bId = new Types.ObjectId().toString();

describe('AiAdvisorService', () => {
  let service: AiAdvisorService;
  let insightsRepo: {
    getUnpaidInvoicesSummary: jest.Mock;
    getProjectValueWindows: jest.Mock;
    getCurrentMonthRevenue: jest.Mock;
    getJobCompletionStats: jest.Mock;
    getSchedulingClusterCandidate: jest.Mock;
    countReengagementClients: jest.Mock;
  };
  let advisorRepo: {
    countJobsInProgress: jest.Mock;
    getReviewStats: jest.Mock;
    getClientGrowth: jest.Mock;
    getTopClientsBySpend: jest.Mock;
  };
  let redis: { get: jest.Mock; set: jest.Mock };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockRejectedValue(new Error('AI disabled in tests'));

    insightsRepo = {
      getUnpaidInvoicesSummary: jest
        .fn()
        .mockResolvedValue({ count: 0, totalOutstanding: 0 }),
      getProjectValueWindows: jest
        .fn()
        .mockResolvedValue({ currentAvg: 0, previousAvg: 0 }),
      getCurrentMonthRevenue: jest.fn().mockResolvedValue(0),
      getJobCompletionStats: jest
        .fn()
        .mockResolvedValue({ completed: 0, total: 0 }),
      getSchedulingClusterCandidate: jest.fn().mockResolvedValue(null),
      countReengagementClients: jest.fn().mockResolvedValue(0),
    };

    advisorRepo = {
      countJobsInProgress: jest.fn().mockResolvedValue(0),
      getReviewStats: jest
        .fn()
        .mockResolvedValue({ count: 0, averageRating: 0 }),
      getClientGrowth: jest
        .fn()
        .mockResolvedValue({ newThisMonth: 0, newLastMonth: 0 }),
      getTopClientsBySpend: jest.fn().mockResolvedValue([]),
    };

    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const config = { get: jest.fn().mockReturnValue(undefined) };

    service = new AiAdvisorService(
      asMock<ConfigService>(config),
      asMock<AiInsightsRepository>(insightsRepo),
      asMock<AiAdvisorRepository>(advisorRepo),
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

  // ─── out-of-scope gate (no AI call, no repository call) ─────────────────────

  describe('out-of-scope questions', () => {
    it('should decline without touching the repository or the AI', async () => {
      // Arrange
      const dto = { question: "What's the weather forecast for tomorrow?" };

      // Act
      const result = await service.askAdvisor(bId, dto);

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.inScope).toBe(false);
      expect(result.topic).toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
      expect(insightsRepo.getUnpaidInvoicesSummary).not.toHaveBeenCalled();
      expect(advisorRepo.countJobsInProgress).not.toHaveBeenCalled();
      expect(redis.get).not.toHaveBeenCalled();
    });

    it('should decline a question unrelated to pricing, marketing, or operations', async () => {
      // Arrange
      const dto = { question: 'Write me a poem about cats' };

      // Act
      const result = await service.askAdvisor(bId, dto);

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.inScope).toBe(false);
      expect(result.answer).toContain(
        'pricing strategy, marketing, and operations',
      );
    });
  });

  // ─── topic classification ───────────────────────────────────────────────────

  describe('topic classification', () => {
    it('should classify an operations-shaped question as operations', async () => {
      // Arrange
      const dto = {
        question:
          'How can I optimize my business operations to improve efficiency and reduce costs?',
      };

      // Act
      const result = await service.askAdvisor(bId, dto);

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.inScope).toBe(true);
      expect(result.topic).toBe(AdvisorTopic.OPERATIONS);
      expect(result.title).toBe('Operations Optimization');
    });

    it('should classify a pricing-shaped question as pricing', async () => {
      // Arrange
      const dto = {
        question: 'What pricing strategy should I use for my services?',
      };

      // Act
      const result = await service.askAdvisor(bId, dto);

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.topic).toBe(AdvisorTopic.PRICING);
    });

    it('should classify a marketing-shaped question as marketing', async () => {
      // Arrange
      const dto = {
        question: 'How can I get more referrals and better reviews?',
      };

      // Act
      const result = await service.askAdvisor(bId, dto);

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.topic).toBe(AdvisorTopic.MARKETING);
    });

    it('should trust an explicit topic and skip keyword classification', async () => {
      // Arrange — question text has no marketing keywords, but topic is set explicitly
      const dto = { question: 'help me', topic: AdvisorTopic.MARKETING };

      // Act
      const result = await service.askAdvisor(bId, dto);

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.inScope).toBe(true);
      expect(result.topic).toBe(AdvisorTopic.MARKETING);
      expect(advisorRepo.getReviewStats).toHaveBeenCalledTimes(1);
    });
  });

  // ─── data-driven answers ────────────────────────────────────────────────────

  describe('operations answer', () => {
    it('should include the exact computed numbers in the answer', async () => {
      // Arrange
      insightsRepo.getJobCompletionStats.mockResolvedValue({
        completed: 4,
        total: 10,
      });
      advisorRepo.countJobsInProgress.mockResolvedValue(3);
      insightsRepo.getUnpaidInvoicesSummary.mockResolvedValue({
        count: 4,
        totalOutstanding: 11600,
      });
      insightsRepo.getSchedulingClusterCandidate.mockResolvedValue({
        location: 'houston',
        count: 5,
      });

      const dto = { question: 'How can I improve my operations?' };

      // Act
      const result = await service.askAdvisor(bId, dto);

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.answer).toContain('40%');
      expect(result.answer).toContain('3 jobs stuck in progress');
      expect(result.answer).toContain('$11,600');
      expect(result.answer).toContain('houston');
    });
  });

  describe('pricing answer', () => {
    it('should include the exact computed numbers in the answer', async () => {
      // Arrange
      insightsRepo.getProjectValueWindows.mockResolvedValue({
        currentAvg: 4125,
        previousAvg: 3587,
      });
      insightsRepo.getUnpaidInvoicesSummary.mockResolvedValue({
        count: 2,
        totalOutstanding: 800,
      });
      insightsRepo.getCurrentMonthRevenue.mockResolvedValue(12400);

      const dto = { question: 'What should my pricing strategy be?' };

      // Act
      const result = await service.askAdvisor(bId, dto);

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.answer).toContain('$4,125');
      expect(result.answer).toContain('15% higher');
      expect(result.answer).toContain('$1,240'); // 10% of 12400
    });
  });

  describe('marketing answer', () => {
    it('should include the exact computed numbers in the answer', async () => {
      // Arrange
      advisorRepo.getReviewStats.mockResolvedValue({
        count: 12,
        averageRating: 4.5,
      });
      advisorRepo.getClientGrowth.mockResolvedValue({
        newThisMonth: 5,
        newLastMonth: 3,
      });
      advisorRepo.getTopClientsBySpend.mockResolvedValue([
        { name: 'Acme Corp', totalSpent: 9800 },
      ]);
      insightsRepo.countReengagementClients.mockResolvedValue(3);

      const dto = { question: 'How do I get more referrals for my business?' };

      // Act
      const result = await service.askAdvisor(bId, dto);

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.answer).toContain('5 new client(s) this month');
      expect(result.answer).toContain('4.5★');
      expect(result.answer).toContain('Acme Corp');
      expect(result.answer).toContain('$9,800');
      expect(result.answer).toContain('3 completed client(s)');
    });
  });

  // ─── token-usage cost controls ──────────────────────────────────────────────

  describe('cost controls', () => {
    it('should not call the AI for out-of-scope questions', async () => {
      // Act
      await service.askAdvisor(bId, { question: 'Tell me a joke' });

      // Assert
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should serve a repeated identical question from cache without calling the AI again', async () => {
      // Arrange
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'AI-polished answer' }],
      });
      const dto = { question: 'How can I improve my operations?' };

      // Act — first call: cache miss, AI called
      let capturedCacheValue = '';
      redis.set.mockImplementation((_key: string, value: string) => {
        capturedCacheValue = value;
        return Promise.resolve(undefined);
      });
      const first = await service.askAdvisor(bId, dto);
      // simulate the cache now holding what was just written
      redis.get.mockResolvedValue(capturedCacheValue);
      const second = await service.askAdvisor(bId, dto);

      // Assert
      if (first instanceof InternalServerErrorException) throw first;
      if (second instanceof InternalServerErrorException) throw second;
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(second.answer).toEqual(first.answer);
    });

    it('should call the AI again when the underlying data has changed', async () => {
      // Arrange
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'AI-polished answer' }],
      });
      const dto = { question: 'How can I improve my operations?' };

      // Act — first call with completion rate 40%
      insightsRepo.getJobCompletionStats.mockResolvedValue({
        completed: 4,
        total: 10,
      });
      await service.askAdvisor(bId, dto);

      // Data changes — completion rate is now 90%
      insightsRepo.getJobCompletionStats.mockResolvedValue({
        completed: 9,
        total: 10,
      });
      await service.askAdvisor(bId, dto);

      // Assert — a fresh AI call was made because the cache key (fingerprint) changed
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should key the cache by businessId, topic, and a data fingerprint', async () => {
      // Arrange
      const dto = { question: 'How can I improve my operations?' };

      // Act
      await service.askAdvisor(bId, dto);

      // Assert
      expect(redis.get).toHaveBeenCalledWith(
        expect.stringContaining(`${bId}:ai:advisor:operations:`),
      );
    });
  });

  // ─── AI polish fallback ─────────────────────────────────────────────────────

  describe('AI polish', () => {
    it('should fall back to the deterministic template when the AI call fails', async () => {
      // Arrange
      mockCreate.mockRejectedValue(new Error('anthropic unavailable'));
      const dto = { question: 'How can I improve my operations?' };

      // Act
      const result = await service.askAdvisor(bId, dto);

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.answer).toContain('Recommendations:');
    });

    it('should use the AI-rewritten answer when the call succeeds', async () => {
      // Arrange
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'A friendlier rewritten answer.' }],
      });
      const dto = { question: 'How can I improve my operations?' };

      // Act
      const result = await service.askAdvisor(bId, dto);

      // Assert
      if (result instanceof InternalServerErrorException) throw result;
      expect(result.answer).toBe('A friendlier rewritten answer.');
    });
  });

  // ─── error handling ──────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should return InternalServerErrorException when the repository throws', async () => {
      // Arrange
      insightsRepo.getJobCompletionStats.mockRejectedValue(
        new Error('db error'),
      );

      // Act
      const result = await service.askAdvisor(bId, {
        question: 'How can I improve my operations?',
      });

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect((result as InternalServerErrorException).message).toBe(
        AI_MESSAGES.ERROR.ADVISOR_FAILED,
      );
    });
  });
});
