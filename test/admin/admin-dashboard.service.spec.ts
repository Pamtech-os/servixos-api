import { InternalServerErrorException } from '@nestjs/common';
import { AdminDashboardService } from 'src/modules/admin/services/admin-dashboard.service';
import { AdminDashboardRepository } from 'src/modules/admin/repositories/admin-dashboard.repository';
import type { DashboardStats } from 'src/modules/admin/types/admin.types';
import { asMock } from 'test/helpers/mock';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let repo: {
    countTotalUsers: jest.Mock;
    sumMonthlyRevenue: jest.Mock;
    countActiveBusinesses: jest.Mock;
    revenueByMonth: jest.Mock;
    businessCountByMonth: jest.Mock;
    findRecentActivities: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      countTotalUsers: jest.fn().mockResolvedValue(100),
      sumMonthlyRevenue: jest.fn().mockResolvedValue(5000),
      countActiveBusinesses: jest.fn().mockResolvedValue(25),
      revenueByMonth: jest.fn().mockResolvedValue([]),
      businessCountByMonth: jest.fn().mockResolvedValue([]),
      findRecentActivities: jest.fn().mockResolvedValue([]),
    };

    service = new AdminDashboardService(asMock<AdminDashboardRepository>(repo));
  });

  // ─── getDashboardStats ───────────────────────────────────────────────────────

  describe('getDashboardStats', () => {
    it('should aggregate all stats in a single call', async () => {
      // Arrange
      repo.countTotalUsers.mockResolvedValue(200);
      repo.sumMonthlyRevenue.mockResolvedValue(12000);
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

    it('should return 6 data points in revenueHistory', async () => {
      // Arrange — sparse revenue; one month has data, five are gaps
      const now = new Date();
      repo.revenueByMonth.mockResolvedValue([
        { year: now.getFullYear(), month: now.getMonth() + 1, total: 900 },
      ]);

      // Act
      const result = await service.getDashboardStats();

      // Assert
      expect(result).not.toBeInstanceOf(InternalServerErrorException);
      expect((result as DashboardStats).revenueHistory).toHaveLength(6);
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
      const lastPoint = stats.revenueHistory[5]; // most recent month
      expect(lastPoint.value).toBe(4200);
    });

    it('should return 6 data points in growthHistory', async () => {
      // Arrange
      repo.businessCountByMonth.mockResolvedValue([]);

      // Act
      const stats = (await service.getDashboardStats()) as DashboardStats;

      // Assert
      expect(stats.growthHistory).toHaveLength(6);
    });

    it('should set first growth slot to 0 (no prior month)', async () => {
      // Arrange
      repo.businessCountByMonth.mockResolvedValue([]);

      // Act
      const stats = (await service.getDashboardStats()) as DashboardStats;

      // Assert
      expect(stats.growthHistory[0].value).toBe(0);
    });

    it('should compute growth percentage correctly for consecutive months', async () => {
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

  // ─── getRecentActivities ─────────────────────────────────────────────────────

  describe('getRecentActivities', () => {
    it('should delegate to repository and return the list', async () => {
      // Arrange
      const activities = [{ action: 'created', actorName: 'Alice' }];
      repo.findRecentActivities.mockResolvedValue(activities);

      // Act
      const result = await service.getRecentActivities();

      // Assert
      expect(result).toEqual(activities);
      expect(repo.findRecentActivities).toHaveBeenCalledWith(20);
    });

    it('should return InternalServerErrorException on repository failure', async () => {
      // Arrange
      repo.findRecentActivities.mockRejectedValue(new Error('timeout'));

      // Act
      const result = await service.getRecentActivities();

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });
});
