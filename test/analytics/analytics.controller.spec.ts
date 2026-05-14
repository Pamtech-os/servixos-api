import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ANALYTICS_MESSAGES } from 'src/common/constants/messages/analytics.messages';
import { AnalyticsController } from 'src/modules/analytics/controllers/analytics.controller';
import { AnalyticsService } from 'src/modules/analytics/services/analytics.service';
import { asMock } from 'test/helpers/mock';

type JwtUserLike = { businessId: string };

const BID = 'biz_0000000000000000000001';
const USER = { businessId: BID } as JwtUserLike as never;

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTrafficResult() {
  return {
    trafficData: [{ date: '2026-04-08', visitors: 42, pageViews: 130 }],
    topPages: [{ page: '/', views: 130, percentage: 100 }],
    stats: {
      totalVisitors: 42,
      totalPageViews: 130,
      dailyAverage: 18.57,
      conversionRate: 0,
    },
  };
}

function makeRevenueResult() {
  return [
    { month: '2026-03', revenue: 4200.0, count: 11 },
    { month: '2026-04', revenue: 5980.25, count: 14 },
  ];
}

function makeJobsResult() {
  return [
    { status: 'pending', count: 18, percentage: 14.29 },
    { status: 'in_progress', count: 24, percentage: 19.05 },
    { status: 'completed', count: 76, percentage: 60.32 },
    { status: 'cancelled', count: 8, percentage: 6.35 },
  ];
}

function makeDashboardResult() {
  return {
    monthlyRevenue: 12400.5,
    activeClientsCount: 23,
    outstandingInvoices: { count: 7, totalAmount: 4350.0 },
    reviewCount: 0,
    recentActivity: [
      {
        id: 'log_001',
        actorName: 'Jane',
        actorRole: 'Admin',
        action: 'Invoice INV-007 created',
        category: 'invoice',
        timestamp: new Date('2026-04-08T10:00:00Z'),
      },
    ],
    topClients: [
      {
        clientId: 'cli_001',
        name: 'Acme Corp',
        email: 'acme@example.com',
        totalSpent: 58400.0,
      },
    ],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: {
    getTrafficAnalytics: jest.Mock;
    getRevenueChart: jest.Mock;
    getJobsAnalytics: jest.Mock;
    getDashboard: jest.Mock;
  };

  beforeEach(() => {
    service = {
      getTrafficAnalytics: jest.fn(),
      getRevenueChart: jest.fn(),
      getJobsAnalytics: jest.fn(),
      getDashboard: jest.fn(),
    };

    controller = new AnalyticsController(asMock<AnalyticsService>(service));
  });

  // ─── GET /analytics/traffic ─────────────────────────────────────────────────

  describe('getTrafficAnalytics', () => {
    it('should delegate to service with the correct businessId and query', async () => {
      // Arrange
      const query = { dateFrom: '2026-04-01', dateTo: '2026-04-30' };
      service.getTrafficAnalytics.mockResolvedValue(makeTrafficResult());

      // Act
      await controller.getTrafficAnalytics(USER, query);

      // Assert
      expect(service.getTrafficAnalytics).toHaveBeenCalledWith(BID, query);
    });

    it('should return the traffic message constant and service data', async () => {
      // Arrange
      const traffic = makeTrafficResult();
      service.getTrafficAnalytics.mockResolvedValue(traffic);

      // Act
      const result = await controller.getTrafficAnalytics(USER, {});

      // Assert
      expect(result.message).toBe(ANALYTICS_MESSAGES.SUCCESS.TRAFFIC_RETRIEVED);
      expect(result.data).toEqual(traffic);
    });

    it('should re-throw when the service returns a NotFoundException', async () => {
      // Arrange
      service.getTrafficAnalytics.mockResolvedValue(
        new NotFoundException('not found'),
      );

      // Act & Assert
      await expect(
        controller.getTrafficAnalytics(USER, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should re-throw when the service returns an InternalServerErrorException', async () => {
      // Arrange
      service.getTrafficAnalytics.mockResolvedValue(
        new InternalServerErrorException(
          ANALYTICS_MESSAGES.ERROR.RETRIEVAL_FAILED,
        ),
      );

      // Act & Assert
      await expect(
        controller.getTrafficAnalytics(USER, {}),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── GET /analytics/revenue ─────────────────────────────────────────────────

  describe('getRevenueChart', () => {
    it('should delegate to service with the correct businessId and query', async () => {
      // Arrange
      const query = { months: 6 };
      service.getRevenueChart.mockResolvedValue(makeRevenueResult());

      // Act
      await controller.getRevenueChart(USER, query);

      // Assert
      expect(service.getRevenueChart).toHaveBeenCalledWith(BID, query);
    });

    it('should return the revenue message constant and service data', async () => {
      // Arrange
      const revenue = makeRevenueResult();
      service.getRevenueChart.mockResolvedValue(revenue);

      // Act
      const result = await controller.getRevenueChart(USER, {});

      // Assert
      expect(result.message).toBe(ANALYTICS_MESSAGES.SUCCESS.REVENUE_RETRIEVED);
      expect(result.data).toEqual(revenue);
    });

    it('should re-throw when the service returns a NotFoundException', async () => {
      // Arrange
      service.getRevenueChart.mockResolvedValue(
        new NotFoundException('business not found'),
      );

      // Act & Assert
      await expect(controller.getRevenueChart(USER, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('should re-throw when the service returns an InternalServerErrorException', async () => {
      // Arrange
      service.getRevenueChart.mockResolvedValue(
        new InternalServerErrorException(
          ANALYTICS_MESSAGES.ERROR.RETRIEVAL_FAILED,
        ),
      );

      // Act & Assert
      await expect(controller.getRevenueChart(USER, {})).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  // ─── GET /analytics/jobs ─────────────────────────────────────────────────────

  describe('getJobsAnalytics', () => {
    it('should delegate to service with the correct businessId', async () => {
      // Arrange
      service.getJobsAnalytics.mockResolvedValue(makeJobsResult());

      // Act
      await controller.getJobsAnalytics(USER);

      // Assert
      expect(service.getJobsAnalytics).toHaveBeenCalledWith(BID);
    });

    it('should return the jobs message constant and service data', async () => {
      // Arrange
      const jobs = makeJobsResult();
      service.getJobsAnalytics.mockResolvedValue(jobs);

      // Act
      const result = await controller.getJobsAnalytics(USER);

      // Assert
      expect(result.message).toBe(ANALYTICS_MESSAGES.SUCCESS.JOBS_RETRIEVED);
      expect(result.data).toEqual(jobs);
    });

    it('should always return four status entries', async () => {
      // Arrange
      service.getJobsAnalytics.mockResolvedValue(makeJobsResult());

      // Act
      const result = await controller.getJobsAnalytics(USER);

      // Assert
      expect(result.data).toHaveLength(4);
    });

    it('should re-throw when the service returns an InternalServerErrorException', async () => {
      // Arrange
      service.getJobsAnalytics.mockResolvedValue(
        new InternalServerErrorException(
          ANALYTICS_MESSAGES.ERROR.RETRIEVAL_FAILED,
        ),
      );

      // Act & Assert
      await expect(controller.getJobsAnalytics(USER)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  // ─── GET /analytics/dashboard ────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('should delegate to service with the correct businessId', async () => {
      // Arrange
      service.getDashboard.mockResolvedValue(makeDashboardResult());

      // Act
      await controller.getDashboard(USER);

      // Assert
      expect(service.getDashboard).toHaveBeenCalledWith(BID);
    });

    it('should return the dashboard message constant and service data', async () => {
      // Arrange
      const dashboard = makeDashboardResult();
      service.getDashboard.mockResolvedValue(dashboard);

      // Act
      const result = await controller.getDashboard(USER);

      // Assert
      expect(result.message).toBe(
        ANALYTICS_MESSAGES.SUCCESS.DASHBOARD_RETRIEVED,
      );
      expect(result.data).toEqual(dashboard);
    });

    it('should include recentActivity and topClients in the response data', async () => {
      // Arrange
      service.getDashboard.mockResolvedValue(makeDashboardResult());

      // Act
      const result = await controller.getDashboard(USER);

      // Assert
      expect(result.data).toHaveProperty('recentActivity');
      expect(result.data).toHaveProperty('topClients');
    });

    it('should return reviewCount as 0 (placeholder until reviews module ships)', async () => {
      // Arrange
      service.getDashboard.mockResolvedValue(makeDashboardResult());

      // Act
      const result = await controller.getDashboard(USER);

      // Assert
      expect((result.data as { reviewCount: number }).reviewCount).toBe(0);
    });

    it('should re-throw when the service returns an InternalServerErrorException', async () => {
      // Arrange
      service.getDashboard.mockResolvedValue(
        new InternalServerErrorException(
          ANALYTICS_MESSAGES.ERROR.RETRIEVAL_FAILED,
        ),
      );

      // Act & Assert
      await expect(controller.getDashboard(USER)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});
