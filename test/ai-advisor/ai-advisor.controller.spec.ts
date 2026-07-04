import { InternalServerErrorException } from '@nestjs/common';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { AiAdvisorController } from 'src/modules/ai-advisor/controllers/ai-advisor.controller';
import { AiAdvisorService } from 'src/modules/ai-advisor/services/ai-advisor.service';
import { AdvisorTopic } from 'src/modules/ai-advisor/types/ai-advisor.types';
import { asMock } from 'test/helpers/mock';

type JwtUserLike = { businessId: string };

const BID = 'biz_0000000000000000000001';
const USER = { businessId: BID } as JwtUserLike as never;

describe('AiAdvisorController', () => {
  let controller: AiAdvisorController;
  let service: { askAdvisor: jest.Mock };

  beforeEach(() => {
    service = { askAdvisor: jest.fn() };
    controller = new AiAdvisorController(asMock<AiAdvisorService>(service));
  });

  describe('ask', () => {
    it('should delegate to service with the correct businessId and dto', async () => {
      // Arrange
      const dto = { question: 'How can I improve my operations?' };
      service.askAdvisor.mockResolvedValue({
        inScope: true,
        topic: AdvisorTopic.OPERATIONS,
        title: 'Operations Optimization',
        answer: '...',
      });

      // Act
      await controller.ask(USER, dto);

      // Assert
      expect(service.askAdvisor).toHaveBeenCalledWith(BID, dto);
    });

    it('should return the advisor message constant and service data', async () => {
      // Arrange
      const answer = {
        inScope: true,
        topic: AdvisorTopic.PRICING,
        title: 'Pricing Strategy',
        answer: 'Raise your prices...',
      };
      service.askAdvisor.mockResolvedValue(answer);

      // Act
      const result = await controller.ask(USER, { question: 'pricing?' });

      // Assert
      expect(result.message).toBe(AI_MESSAGES.SUCCESS.ADVISOR_RESPONSE);
      expect(result.data).toEqual(answer);
    });

    it('should re-throw when the service returns an InternalServerErrorException', async () => {
      // Arrange
      service.askAdvisor.mockResolvedValue(
        new InternalServerErrorException(AI_MESSAGES.ERROR.ADVISOR_FAILED),
      );

      // Act & Assert
      await expect(
        controller.ask(USER, { question: 'anything' }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
});
