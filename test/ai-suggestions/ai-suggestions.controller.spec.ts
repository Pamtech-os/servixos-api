import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { AiSuggestionsController } from 'src/modules/ai-suggestions/controllers/ai-suggestions.controller';
import { AiSuggestionsService } from 'src/modules/ai-suggestions/services/ai-suggestions.service';
import {
  SuggestionId,
  SuggestionTag,
} from 'src/modules/ai-suggestions/types/ai-suggestions.types';
import { asMock } from 'test/helpers/mock';

type JwtUserLike = { businessId: string };

const BID = 'biz_0000000000000000000001';
const USER = { businessId: BID } as JwtUserLike as never;

describe('AiSuggestionsController', () => {
  let controller: AiSuggestionsController;
  let service: {
    listSuggestions: jest.Mock;
    applySuggestion: jest.Mock;
    dismissSuggestion: jest.Mock;
  };

  beforeEach(() => {
    service = {
      listSuggestions: jest.fn(),
      applySuggestion: jest.fn(),
      dismissSuggestion: jest.fn(),
    };
    controller = new AiSuggestionsController(
      asMock<AiSuggestionsService>(service),
    );
  });

  describe('getSuggestions', () => {
    it('should delegate to service with the correct businessId', async () => {
      // Arrange
      service.listSuggestions.mockResolvedValue({ count: 0, suggestions: [] });

      // Act
      await controller.getSuggestions(USER);

      // Assert
      expect(service.listSuggestions).toHaveBeenCalledWith(BID);
    });

    it('should return the suggestions message constant and service data', async () => {
      // Arrange
      const data = {
        count: 1,
        suggestions: [
          {
            id: SuggestionId.OPTIMIZE_PRICING,
            text: 'Optimize pricing',
            tag: SuggestionTag.HIGH_IMPACT,
          },
        ],
      };
      service.listSuggestions.mockResolvedValue(data);

      // Act
      const result = await controller.getSuggestions(USER);

      // Assert
      expect(result.message).toBe(AI_MESSAGES.SUCCESS.SUGGESTIONS_GENERATED);
      expect(result.data).toEqual(data);
    });
  });

  describe('apply', () => {
    it('should delegate to service with the correct businessId and suggestion id', async () => {
      // Arrange
      service.applySuggestion.mockResolvedValue({
        id: SuggestionId.OPTIMIZE_PRICING,
        summary: 'done',
        remaining: 0,
      });

      // Act
      await controller.apply(USER, { id: SuggestionId.OPTIMIZE_PRICING });

      // Assert
      expect(service.applySuggestion).toHaveBeenCalledWith(
        BID,
        SuggestionId.OPTIMIZE_PRICING,
      );
    });

    it('should return the applied message constant and service data', async () => {
      // Arrange
      const data = {
        id: SuggestionId.OPTIMIZE_PRICING,
        summary: 'Increased pricing by 10% on 3 upcoming jobs.',
        remaining: 4,
      };
      service.applySuggestion.mockResolvedValue(data);

      // Act
      const result = await controller.apply(USER, {
        id: SuggestionId.OPTIMIZE_PRICING,
      });

      // Assert
      expect(result.message).toBe(AI_MESSAGES.SUCCESS.SUGGESTION_APPLIED);
      expect(result.data).toEqual(data);
    });

    it('should re-throw when the service returns a NotFoundException', async () => {
      // Arrange
      service.applySuggestion.mockResolvedValue(
        new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND),
      );

      // Act & Assert
      await expect(
        controller.apply(USER, { id: SuggestionId.OPTIMIZE_PRICING }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should re-throw when the service returns an InternalServerErrorException', async () => {
      // Arrange
      service.applySuggestion.mockResolvedValue(
        new InternalServerErrorException(AI_MESSAGES.ERROR.SUGGESTIONS_FAILED),
      );

      // Act & Assert
      await expect(
        controller.apply(USER, { id: SuggestionId.OPTIMIZE_PRICING }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('dismiss', () => {
    it('should delegate to service with the correct businessId and suggestion id', async () => {
      // Arrange
      service.dismissSuggestion.mockResolvedValue({
        id: SuggestionId.CLIENT_FOLLOW_UPS,
        remaining: 2,
      });

      // Act
      await controller.dismiss(USER, { id: SuggestionId.CLIENT_FOLLOW_UPS });

      // Assert
      expect(service.dismissSuggestion).toHaveBeenCalledWith(
        BID,
        SuggestionId.CLIENT_FOLLOW_UPS,
      );
    });

    it('should return the dismissed message constant and service data', async () => {
      // Arrange
      const data = { id: SuggestionId.CLIENT_FOLLOW_UPS, remaining: 2 };
      service.dismissSuggestion.mockResolvedValue(data);

      // Act
      const result = await controller.dismiss(USER, {
        id: SuggestionId.CLIENT_FOLLOW_UPS,
      });

      // Assert
      expect(result.message).toBe(AI_MESSAGES.SUCCESS.SUGGESTION_DISMISSED);
      expect(result.data).toEqual(data);
    });
  });
});
