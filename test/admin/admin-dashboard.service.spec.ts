import { InternalServerErrorException } from '@nestjs/common';
import { AdminDashboardService } from 'src/modules/admin/services/admin-dashboard.service';
import { AdminDashboardRepository } from 'src/modules/admin/repositories/admin-dashboard.repository';
import type { DashboardStats } from 'src/modules/admin/types/admin.types';
import { asMock } from 'test/helpers/mock';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let repo: {
    countTotalUsers: jest.Mock;
    sumRevenue: jest.Mock;
    countActiveBusinesses: jest.Mock;
    revenueByMonth: jest.Mock;
    revenueByDay: jest.Mock;
    businessCountByMonth: jest.Mock;
    businessCountByDay: jest.Mock;
    findRecentActivities: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      countTotalUsers: jest.fn().mockResolvedValue(100),
      sumRevenue: jest.fn().mockResolvedValue(5000),
      countActiveBusinesses: jest.fn().mockResolvedValue(25),
      revenueByMonth: jest.fn().mockResolvedValue([]),
      revenueByDay: jest.fn().mockResolvedValue([]),
      businessCountByMonth: jest.fn().mockResolvedValue([]),
      businessCountByDay: jest.fn().mockResolvedValue([]),
      findRecentActivities: jest.fn().mockResolvedValue([]),
    };

    service = new AdminDashboardService(asMock<AdminDashboardRepository>(repo));
  });

  // ─── getDashboardStats (default — no period) ─────────────────────────────────

  describe('getDashboardStats (no period)', () => {
    it('should use monthly methods and scope revenue to current month', async () => {
      // Arrange — nothing extra

      // Act
      await service.getDashboardStats();

      // Assert
      expect(repo.revenueByMonth).toHaveBeenCalledWith(6);
      expect(repo.businessCountByMonth).toHaveBeenCalledWith(6);
      expect(repo.revenueByDay).not.toHaveBeenCalled();
      expect(repo.businessCountByDay).not.toHaveBeenCalled();
      // countTotalUsers called with no date argument
      expect(repo.countTotalUsers).toHaveBeenCalledWith();
    });

    it('should aggregate all stats in a single call', async () => {
      // Arrange
      repo.countTotalUsers.mockResolvedValue(200);
      repo.sumRevenue.mockResolvedValue(12000);
      repo.countActiveBusinesses.mockResolvedValue(40);

      // Act
      const result = await service.getDashboardStats();

      // Assert
      expect(result).toMatchObject({
        totalUsers: 200,
        monthlyRevenue: 12000,
        activeBusinesses: 40,
      });
    });

    it('should include recentActivities fetched with limit 5', async () => {
      // Arrange
      const activities = [
        {
          action: 'created',
          category: 'business',
          actorName: 'Alice',
          createdAt: new Date(),
        },
      ];
      repo.findRecentActivities.mockResolvedValue(activities);

      // Act
      const stats = (await service.getDashboardStats()) as DashboardStats;

      // Assert
      expect(stats.recentActivities).toEqual(activities);
      expect(repo.findRecentActivities).toHaveBeenCalledWith(5);
    });

    it('should return 6 data points in revenueHistory', async () => {
      // Arrange — sparse revenue; one month has data, five are gaps
      const now = new Date();
      repo.revenueByMonth.mockResolvedValue([
        { year: now.getFullYear(), month: now.getMonth() + 1, total: 900 },
      ]);

      // Act
      const stats = (await service.getDashboardStats()) as DashboardStats;

      // Assert
      expect(stats.revenueHistory).toHaveLength(6);
    });

    it('should fill missing revenue months with 0', async () => {
      // Arrange — no revenue data at all
      repo.revenueByMonth.mockResolvedValue([]);

      // Act
      const stats = (await service.getDashboardStats()) as DashboardStats;

      // Assert
      expect(stats.revenueHistory.every((p) => p.value === 0)).toBe(true);
    });

    it('should fill known revenue month with its total', async () => {
      // Arrange
      const now = new Date();
      repo.revenueByMonth.mockResolvedValue([
        { year: now.getFullYear(), month: now.getMonth() + 1, total: 4200 },
      ]);

      // Act
      const stats = (await service.getDashboardStats()) as DashboardStats;

      // Assert
      expect(stats.revenueHistory[5].value).toBe(4200);
    });

    it('should return 6 data points in growthHistory', async () => {
      // Arrange
      repo.businessCountByMonth.mockResolvedValue([]);

      // Act
      const stats = (await service.getDashboardStats()) as DashboardStats;

      // Assert
      expect(stats.growthHistory).toHaveLength(6);
    });

    it('should compute growth % correctly for consecutive months', async () => {
      // Arrange — 5 businesses last month, 10 this month → 100% growth
      const now = new Date();
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      repo.businessCountByMonth.mockResolvedValue([
        {
          year: prevDate.getFullYear(),
          month: prevDate.getMonth() + 1,
          count: 5,
        },
        { year: now.getFullYear(), month: now.getMonth() + 1, count: 10 },
      ]);

      // Act
      const stats = (await service.getDashboardStats()) as DashboardStats;

      // Assert
      expect(stats.growthHistory[5].value).toBe(100);
    });

    it('should return InternalServerErrorException on repository failure', async () => {
      // Arrange
      repo.countTotalUsers.mockRejectedValue(new Error('DB down'));

      // Act
      const result = await service.getDashboardStats();

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── getDashboardStats (period = today) ──────────────────────────────────────

  describe('getDashboardStats (period = today)', () => {
    it('should pass a from date (start of today) to all repositories', async () => {
      // Arrange
      const beforeCall = new Date();
      beforeCall.setHours(0, 0, 0, 0);

      // Act
      await service.getDashboardStats('today');

      // Assert
      expect(repo.countTotalUsers).toHaveBeenCalledWith(expect.any(Date));
      const from = (repo.countTotalUsers.mock.calls[0] as [Date])[0];
      expect(from.getHours()).toBe(0);
      expect(from.getMinutes()).toBe(0);
      expect(from >= beforeCall).toBe(true);
    });

    it('should use daily methods instead of monthly methods', async () => {
      // Arrange — nothing extra

      // Act
      await service.getDashboardStats('today');

      // Assert
      expect(repo.revenueByDay).toHaveBeenCalled();
      expect(repo.businessCountByDay).toHaveBeenCalled();
      expect(repo.revenueByMonth).not.toHaveBeenCalled();
      expect(repo.businessCountByMonth).not.toHaveBeenCalled();
    });

    it('should return 1 data point in revenueHistory for today', async () => {
      // Arrange — nothing extra

      // Act
      const stats = (await service.getDashboardStats(
        'today',
      )) as DashboardStats;

      // Assert — today = 1 day slot
      expect(stats.revenueHistory).toHaveLength(1);
    });

    it('should pass from to findRecentActivities', async () => {
      // Arrange — nothing extra

      // Act
      await service.getDashboardStats('today');

      // Assert
      expect(repo.findRecentActivities).toHaveBeenCalledWith(
        5,
        expect.any(Date),
      );
    });
  });

  // ─── getDashboardStats (period = last7days) ───────────────────────────────────

  describe('getDashboardStats (period = last7days)', () => {
    it('should return 7 data points in revenueHistory', async () => {
      // Arrange — nothing extra

      // Act
      const stats = (await service.getDashboardStats(
        'last7days',
      )) as DashboardStats;

      // Assert
      expect(stats.revenueHistory).toHaveLength(7);
    });

    it('should fill daily revenue slots using repository buckets', async () => {
      // Arrange — repo returns data for yesterday only; all other days are zero-filled
      const now = new Date();
      const yesterday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1,
      );
      repo.revenueByDay.mockResolvedValue([
        {
          year: yesterday.getFullYear(),
          month: yesterday.getMonth() + 1,
          day: yesterday.getDate(),
          total: 750,
        },
      ]);

      // Act
      const stats = (await service.getDashboardStats(
        'last7days',
      )) as DashboardStats;

      // Assert — one slot with 750, all others zero
      const nonZero = stats.revenueHistory.filter((p) => p.value > 0);
      expect(nonZero).toHaveLength(1);
      expect(nonZero[0].value).toBe(750);
    });

    it('should use daily methods and scope counts to the 7-day window', async () => {
      // Arrange
      repo.countTotalUsers.mockResolvedValue(12);
      repo.countActiveBusinesses.mockResolvedValue(3);

      // Act
      const stats = (await service.getDashboardStats(
        'last7days',
      )) as DashboardStats;

      // Assert
      expect(stats.totalUsers).toBe(12);
      expect(stats.activeBusinesses).toBe(3);
      expect(repo.revenueByDay).toHaveBeenCalled();
      expect(repo.businessCountByDay).toHaveBeenCalled();
    });
  });

  // ─── getDashboardStats (period = last30days) ──────────────────────────────────

  describe('getDashboardStats (period = last30days)', () => {
    it('should return 30 data points in revenueHistory', async () => {
      // Arrange — nothing extra

      // Act
      const stats = (await service.getDashboardStats(
        'last30days',
      )) as DashboardStats;

      // Assert
      expect(stats.revenueHistory).toHaveLength(30);
    });

    it('should sum revenue over the 30-day window', async () => {
      // Arrange
      repo.sumRevenue.mockResolvedValue(88000);

      // Act
      const stats = (await service.getDashboardStats(
        'last30days',
      )) as DashboardStats;

      // Assert
      expect(stats.monthlyRevenue).toBe(88000);
    });
  });
});
