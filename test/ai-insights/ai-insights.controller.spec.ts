import { InternalServerErrorException } from '@nestjs/common';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { AiInsightsController } from 'src/modules/ai-insights/controllers/ai-insights.controller';
import { AiInsightsService } from 'src/modules/ai-insights/services/ai-insights.service';
import {
  InsightCategory,
  InsightSeverity,
} from 'src/modules/ai-insights/types/ai-insights.types';
import { asMock } from 'test/helpers/mock';

type JwtUserLike = { businessId: string };

const BID = 'biz_0000000000000000000001';
const USER = { businessId: BID } as JwtUserLike as never;

function makeInsightsResult() {
  return {
    categories: [
      { key: InsightCategory.REVENUE, label: 'Revenue', count: 3 },
      { key: InsightCategory.CLIENTS, label: 'Clients', count: 2 },
      { key: InsightCategory.OPERATIONS, label: 'Operations', count: 2 },
      { key: InsightCategory.GROWTH, label: 'Growth', count: 1 },
    ],
    insights: [
      {
        id: 'unpaid-invoices',
        category: InsightCategory.REVENUE,
        title: 'Unpaid Invoices Alert',
        description: 'You have 4 unpaid invoices totaling $11,600.',
        severity: InsightSeverity.HIGH,
        action: { label: 'View Invoices', link: '/invoices?status=pending' },
      },
    ],
  };
}

describe('AiInsightsController', () => {
  let controller: AiInsightsController;
  let service: { generateInsights: jest.Mock };

  beforeEach(() => {
    service = { generateInsights: jest.fn() };
    controller = new AiInsightsController(asMock<AiInsightsService>(service));
  });

  describe('getInsights', () => {
    it('should delegate to service with the correct businessId and query', async () => {
      // Arrange
      const query = { category: InsightCategory.REVENUE };
      service.generateInsights.mockResolvedValue(makeInsightsResult());

      // Act
      await controller.getInsights(USER, query);

      // Assert
      expect(service.generateInsights).toHaveBeenCalledWith(BID, query);
    });

    it('should return the insights message constant and service data', async () => {
      // Arrange
      const insightsResult = makeInsightsResult();
      service.generateInsights.mockResolvedValue(insightsResult);

      // Act
      const result = await controller.getInsights(USER, {});

      // Assert
      expect(result.message).toBe(AI_MESSAGES.SUCCESS.INSIGHTS_GENERATED);
      expect(result.data).toEqual(insightsResult);
    });

    it('should re-throw when the service returns an InternalServerErrorException', async () => {
      // Arrange
      service.generateInsights.mockResolvedValue(
        new InternalServerErrorException(AI_MESSAGES.ERROR.INSIGHTS_FAILED),
      );

      // Act & Assert
      await expect(controller.getInsights(USER, {})).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});
