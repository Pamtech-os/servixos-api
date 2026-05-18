import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { ANALYTICS_MESSAGES } from 'src/common/constants/messages/analytics.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { Business } from 'src/modules/business/schemas/business.schema';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { JobStatus } from 'src/modules/jobs/schemas/job.schema';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { AnalyticsRepository } from 'src/modules/analytics/repositories/analytics.repository';
import { AnalyticsService } from 'src/modules/analytics/services/analytics.service';
import { asMock } from 'test/helpers/mock';

// ─── Factories ────────────────────────────────────────────────────────────────

const bId = new Types.ObjectId().toString();

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    _id: new Types.ObjectId(),
    name: 'Test Biz',
    timezone: 'UTC',
    deletedAt: undefined,
    ...overrides,
  } as Business;
}

// ─── Mock setup ───────────────────────────────────────────────────────────────

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let loggerErrorSpy: jest.SpyInstance;

  let analyticsRepo: {
    getTrafficData: jest.Mock;
    getTopPages: jest.Mock;
    countTotalPageViews: jest.Mock;
    countServiceRequestsInPeriod: jest.Mock;
    getRevenueByMonth: jest.Mock;
    getJobStatusDistribution: jest.Mock;
    getCurrentMonthRevenue: jest.Mock;
    countActiveClients: jest.Mock;
    getOutstandingInvoices: jest.Mock;
    countReviews: jest.Mock;
    getRecentActivity: jest.Mock;
    getTopClientsBySpend: jest.Mock;
  };

  let businessRepo: {
    findById: jest.Mock;
  };

  let redis: {
    get: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(() => {
    analyticsRepo = {
      getTrafficData: jest.fn(),
      getTopPages: jest.fn(),
      countTotalPageViews: jest.fn(),
      countServiceRequestsInPeriod: jest.fn(),
      getRevenueByMonth: jest.fn(),
      getJobStatusDistribution: jest.fn(),
      getCurrentMonthRevenue: jest.fn(),
      countActiveClients: jest.fn(),
      getOutstandingInvoices: jest.fn(),
      countReviews: jest.fn().mockResolvedValue(0),
      getRecentActivity: jest.fn(),
      getTopClientsBySpend: jest.fn(),
    };

    businessRepo = { findById: jest.fn() };

    redis = { get: jest.fn(), set: jest.fn() };

    service = new AnalyticsService(
      asMock<AnalyticsRepository>(analyticsRepo),
      asMock<BusinessRepository>(businessRepo),
      asMock<RedisService>(redis),
    );

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  // ─── getTrafficAnalytics ────────────────────────────────────────────────────

  describe('getTrafficAnalytics', () => {
    it('should return cached data without hitting the database', async () => {
      // Arrange
      const cachedPayload = {
        trafficData: [{ date: '2026-04-08', visitors: 42, pageViews: 130 }],
        topPages: [],
        stats: {
          totalVisitors: 42,
          totalPageViews: 130,
          dailyAverage: 18.57,
          conversionRate: 0,
        },
      };
      redis.get.mockResolvedValue(JSON.stringify(cachedPayload));

      // Act
      const result = await service.getTrafficAnalytics(bId, {});

      // Assert
      expect(result).toEqual(cachedPayload);
      expect(businessRepo.findById).not.toHaveBeenCalled();
      expect(analyticsRepo.getTrafficData).not.toHaveBeenCalled();
    });

    it('should fetch from repository, compute stats, and cache on cache miss', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);
      businessRepo.findById.mockResolvedValue(
        makeBusiness({ timezone: 'UTC' }),
      );
      analyticsRepo.getTrafficData.mockResolvedValue([
        { date: '2026-04-08', visitors: 10, pageViews: 30 },
        { date: '2026-04-09', visitors: 20, pageViews: 50 },
      ]);
      analyticsRepo.getTopPages.mockResolvedValue([{ page: '/', views: 80 }]);
      analyticsRepo.countTotalPageViews.mockResolvedValue(80);
      analyticsRepo.countServiceRequestsInPeriod.mockResolvedValue(2);

      // Act
      const result = await service.getTrafficAnalytics(bId, {});

      // Assert
      expect(result).not.toBeInstanceOf(Error);
      if (result instanceof Error) return;

      expect(result.stats.totalVisitors).toBe(30); // 10 + 20
      expect(result.stats.totalPageViews).toBe(80);
      expect(result.topPages[0].percentage).toBe(100); // 80/80 * 100
      expect(result.stats.conversionRate).toBe(6.67); // 2/30 * 100
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining(':analytics:traffic:'),
        expect.any(String),
        CACHE_TTL.ANALYTICS_TRAFFIC,
      );
    });

    it('should return NotFoundException when business does not exist', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);
      businessRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.getTrafficAnalytics(bId, {});

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        COMMON_MESSAGES.ERROR.NOT_FOUND,
      );
    });

    it('should return InternalServerErrorException on unexpected database error', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);
      businessRepo.findById.mockRejectedValue(new Error('DB connection lost'));

      // Act
      const result = await service.getTrafficAnalytics(bId, {});

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect((result as InternalServerErrorException).message).toBe(
        ANALYTICS_MESSAGES.ERROR.RETRIEVAL_FAILED,
      );
    });

    it('should use provided dateFrom/dateTo in the cache key', async () => {
      // Arrange
      const dto = { dateFrom: '2026-01-01', dateTo: '2026-01-31' };
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);
      businessRepo.findById.mockResolvedValue(makeBusiness());
      analyticsRepo.getTrafficData.mockResolvedValue([]);
      analyticsRepo.getTopPages.mockResolvedValue([]);
      analyticsRepo.countTotalPageViews.mockResolvedValue(0);
      analyticsRepo.countServiceRequestsInPeriod.mockResolvedValue(0);

      // Act
      await service.getTrafficAnalytics(bId, dto);

      // Assert — the cache key must include the explicit dates
      expect(redis.get).toHaveBeenCalledWith(
        expect.stringContaining('2026-01-01:2026-01-31'),
      );
    });
  });

  // ─── getRevenueChart ────────────────────────────────────────────────────────

  describe('getRevenueChart', () => {
    it('should return cached data on cache hit', async () => {
      // Arrange
      const cached = [{ month: '2026-04', revenue: 5200, count: 12 }];
      redis.get.mockResolvedValue(JSON.stringify(cached));

      // Act
      const result = await service.getRevenueChart(bId, {});

      // Assert
      expect(result).toEqual(cached);
      expect(analyticsRepo.getRevenueByMonth).not.toHaveBeenCalled();
    });

    it('should fill in zero-revenue months on cache miss', async () => {
      // Arrange — repository returns data for only one month
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);
      businessRepo.findById.mockResolvedValue(
        makeBusiness({ timezone: 'UTC' }),
      );
      analyticsRepo.getRevenueByMonth.mockResolvedValue([
        { month: '2026-04', revenue: 3000, count: 5 },
      ]);

      // Act — request 2 months
      const result = await service.getRevenueChart(bId, { months: 2 });

      // Assert — result should have 2 entries; the missing month is zero-filled
      expect(result).not.toBeInstanceOf(Error);
      if (result instanceof Error) return;

      expect(result).toHaveLength(2);
      const months = (result as { month: string }[]).map((r) => r.month);
      expect(months).toContain('2026-04');
    });

    it('should return NotFoundException when business is not found', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);
      businessRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.getRevenueChart(bId, {});

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should use default of 7 months when dto.months is omitted', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);
      businessRepo.findById.mockResolvedValue(makeBusiness());
      analyticsRepo.getRevenueByMonth.mockResolvedValue([]);

      // Act
      await service.getRevenueChart(bId, {});

      // Assert — cache key must contain 7
      expect(redis.get).toHaveBeenCalledWith(
        expect.stringContaining(':analytics:revenue:7'),
      );
    });
  });

  // ─── getJobsAnalytics ───────────────────────────────────────────────────────

  describe('getJobsAnalytics', () => {
    it('should return cached result on cache hit', async () => {
      // Arrange
      const cached = [{ status: 'pending', count: 5, percentage: 100 }];
      redis.get.mockResolvedValue(JSON.stringify(cached));

      // Act
      const result = await service.getJobsAnalytics(bId);

      // Assert
      expect(result).toEqual(cached);
      expect(analyticsRepo.getJobStatusDistribution).not.toHaveBeenCalled();
    });

    it('should return all four statuses with correct percentages on cache miss', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);
      analyticsRepo.getJobStatusDistribution.mockResolvedValue([
        { status: JobStatus.PENDING, count: 10 },
        { status: JobStatus.COMPLETED, count: 90 },
      ]);

      // Act
      const result = await service.getJobsAnalytics(bId);

      // Assert
      expect(result).not.toBeInstanceOf(Error);
      if (result instanceof Error) return;

      expect(result).toHaveLength(4); // all statuses present

      type Row = { status: string; count: number; percentage: number };
      const rows = result as Row[];

      const pendingRow = rows.find(
        (r) => r.status === (JobStatus.PENDING as string),
      );
      const inProgressRow = rows.find(
        (r) => r.status === (JobStatus.IN_PROGRESS as string),
      );

      expect(pendingRow?.count).toBe(10);
      expect(pendingRow?.percentage).toBe(10); // 10/100 * 100
      expect(inProgressRow?.count).toBe(0); // zero-filled
      expect(inProgressRow?.percentage).toBe(0);
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);
      analyticsRepo.getJobStatusDistribution.mockRejectedValue(
        new Error('timeout'),
      );

      // Act
      const result = await service.getJobsAnalytics(bId);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── getDashboard ───────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('should return cached result on cache hit', async () => {
      // Arrange
      const cached = {
        monthlyRevenue: 12400,
        activeClientsCount: 23,
        outstandingInvoices: { count: 5, totalAmount: 3200 },
        reviewCount: 0,
        recentActivity: [],
        topClients: [],
      };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      // Act
      const result = await service.getDashboard(bId);

      // Assert
      expect(result).toEqual(cached);
      expect(analyticsRepo.getCurrentMonthRevenue).not.toHaveBeenCalled();
    });

    it('should aggregate all six queries in parallel and return shaped data', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);

      const clientObjectId = new Types.ObjectId();

      analyticsRepo.getCurrentMonthRevenue.mockResolvedValue(12400.567);
      analyticsRepo.countActiveClients.mockResolvedValue(23);
      analyticsRepo.getOutstandingInvoices.mockResolvedValue({
        count: 5,
        totalAmount: 3200.1234,
      });
      analyticsRepo.getRecentActivity.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          actorName: 'Jane',
          actorRole: 'admin',
          action: 'Created invoice',
          category: 'invoice',
          timestamp: new Date('2026-04-08T10:00:00Z'),
        },
      ]);
      analyticsRepo.getTopClientsBySpend.mockResolvedValue([
        {
          clientId: clientObjectId,
          name: 'Acme Corp',
          email: 'acme@example.com',
          totalSpent: 9800.99,
        },
      ]);

      // Act
      const result = await service.getDashboard(bId);

      // Assert
      expect(result).not.toBeInstanceOf(Error);
      if (result instanceof Error) return;

      const stats = result as {
        monthlyRevenue: number;
        activeClientsCount: number;
        outstandingInvoices: { count: number; totalAmount: number };
        reviewCount: number;
        recentActivity: { actorName: string }[];
        topClients: { clientId: string; totalSpent: number }[];
      };

      expect(stats.monthlyRevenue).toBe(12400.57); // rounded to 2 dp
      expect(stats.activeClientsCount).toBe(23);
      expect(stats.outstandingInvoices.totalAmount).toBe(3200.12); // rounded
      expect(stats.reviewCount).toBe(0); // countReviews mock returns 0
      expect(stats.recentActivity[0].actorName).toBe('Jane');
      expect(stats.topClients[0].clientId).toBe(clientObjectId.toString());
      expect(stats.topClients[0].totalSpent).toBe(9800.99);
    });

    it('should run all six repository queries concurrently', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);

      const callOrder: string[] = [];

      analyticsRepo.getCurrentMonthRevenue.mockImplementation(() => {
        callOrder.push('revenue');
        return Promise.resolve(0);
      });
      analyticsRepo.countActiveClients.mockImplementation(() => {
        callOrder.push('clients');
        return Promise.resolve(0);
      });
      analyticsRepo.getOutstandingInvoices.mockImplementation(() => {
        callOrder.push('invoices');
        return Promise.resolve({ count: 0, totalAmount: 0 });
      });
      analyticsRepo.countReviews.mockImplementation(() => {
        callOrder.push('reviews');
        return Promise.resolve(0);
      });
      analyticsRepo.getRecentActivity.mockImplementation(() => {
        callOrder.push('activity');
        return Promise.resolve([]);
      });
      analyticsRepo.getTopClientsBySpend.mockImplementation(() => {
        callOrder.push('topClients');
        return Promise.resolve([]);
      });

      // Act
      await service.getDashboard(bId);

      // Assert — all six were called (order may vary because they run in parallel)
      expect(callOrder).toHaveLength(6);
      expect(callOrder).toEqual(
        expect.arrayContaining([
          'revenue',
          'clients',
          'invoices',
          'reviews',
          'activity',
          'topClients',
        ]),
      );
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);
      analyticsRepo.getCurrentMonthRevenue.mockRejectedValue(
        new Error('aggregation failed'),
      );
      analyticsRepo.countActiveClients.mockResolvedValue(0);
      analyticsRepo.getOutstandingInvoices.mockResolvedValue({
        count: 0,
        totalAmount: 0,
      });
      analyticsRepo.getRecentActivity.mockResolvedValue([]);
      analyticsRepo.getTopClientsBySpend.mockResolvedValue([]);

      // Act
      const result = await service.getDashboard(bId);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect((result as InternalServerErrorException).message).toBe(
        ANALYTICS_MESSAGES.ERROR.RETRIEVAL_FAILED,
      );
    });

    it('should write dashboard result to cache with correct TTL', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);
      analyticsRepo.getCurrentMonthRevenue.mockResolvedValue(0);
      analyticsRepo.countActiveClients.mockResolvedValue(0);
      analyticsRepo.getOutstandingInvoices.mockResolvedValue({
        count: 0,
        totalAmount: 0,
      });
      analyticsRepo.getRecentActivity.mockResolvedValue([]);
      analyticsRepo.getTopClientsBySpend.mockResolvedValue([]);

      // Act
      await service.getDashboard(bId);

      // Assert
      expect(redis.set).toHaveBeenCalledWith(
        `${bId}:analytics:dashboard`,
        expect.any(String),
        CACHE_TTL.DASHBOARD_STATS,
      );
    });
  });
});
