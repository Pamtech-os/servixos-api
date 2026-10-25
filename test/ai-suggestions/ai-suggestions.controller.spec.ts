import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { AiSuggestionsController } from 'src/modules/ai-suggestions/controllers/ai-suggestions.controller';
import { AiSuggestionsService } from 'src/modules/ai-suggestions/services/ai-suggestions.service';
import { SuggestionCategory } from 'src/modules/ai-suggestions/types/ai-suggestions.types';
import { asMock } from 'test/helpers/mock';

type JwtUserLike = { businessId: string };

const BID = 'biz_0000000000000000000001';
const SUGGESTION_ID = '665f1c2b9d3e4a0012345678';
const USER = { businessId: BID } as JwtUserLike as never;

describe('AiSuggestionsController', () => {
  let controller: AiSuggestionsController;
  let service: {
    listSuggestions: jest.Mock;
    listTracked: jest.Mock;
    executeSuggestion: jest.Mock;
    dismissSuggestion: jest.Mock;
  };

  beforeEach(() => {
    service = {
      listSuggestions: jest.fn(),
      listTracked: jest.fn(),
      executeSuggestion: jest.fn(),
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
      const data = { count: 0, suggestions: [] };
      service.listSuggestions.mockResolvedValue(data);

      // Act
      const result = await controller.getSuggestions(USER);

      // Assert
      expect(result).toEqual({
        message: AI_MESSAGES.SUCCESS.SUGGESTIONS_GENERATED,
        data,
      });
    });

    it('should throw when the service returns an HttpException', async () => {
      // Arrange
      service.listSuggestions.mockResolvedValue(
        new InternalServerErrorException(AI_MESSAGES.ERROR.SUGGESTIONS_FAILED),
      );

      // Act
      const act = controller.getSuggestions(USER);

      // Assert
      await expect(act).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('getTracked', () => {
    it('should return the tracked message constant and service data', async () => {
      // Arrange
      const data = {
        tracked: [
          {
            id: SUGGESTION_ID,
            category: SuggestionCategory.CASH_FLOW,
            title: 'Invoice INV-2026-0001 is 12 days overdue',
            executeLabel: 'Send reminder',
            executedAt: '2026-10-23T10:15:00.000Z',
            outcome: null,
          },
        ],
      };
      service.listTracked.mockResolvedValue(data);

      // Act
      const result = await controller.getTracked(USER);

      // Assert
      expect(result).toEqual({
        message: AI_MESSAGES.SUCCESS.TRACKED_SUGGESTIONS_RETRIEVED,
        data,
      });
    });

    it('should throw when the service returns an HttpException', async () => {
      // Arrange
      service.listTracked.mockResolvedValue(
        new InternalServerErrorException(AI_MESSAGES.ERROR.SUGGESTIONS_FAILED),
      );

      // Act
      const act = controller.getTracked(USER);

      // Assert
      await expect(act).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('apply', () => {
    it('should pass the edited draftValue through to the service', async () => {
      // Arrange
      service.executeSuggestion.mockResolvedValue({
        id: SUGGESTION_ID,
        remaining: 2,
        executedAt: '2026-10-23T10:15:00.000Z',
      });

      // Act
      await controller.apply(
        USER,
        { id: SUGGESTION_ID },
        { draftValue: 'Hi Adaeze, edited' },
      );

      // Assert
      expect(service.executeSuggestion).toHaveBeenCalledWith(
        BID,
        SUGGESTION_ID,
        'Hi Adaeze, edited',
      );
    });

    it('should return the executed message constant and service data', async () => {
      // Arrange
      const data = {
        id: SUGGESTION_ID,
        remaining: 2,
        executedAt: '2026-10-23T10:15:00.000Z',
      };
      service.executeSuggestion.mockResolvedValue(data);

      // Act
      const result = await controller.apply(USER, { id: SUGGESTION_ID }, {});

      // Assert
      expect(result).toEqual({
        message: AI_MESSAGES.SUCCESS.SUGGESTION_EXECUTED,
        data,
      });
    });

    it('should throw NotFoundException when the suggestion is unavailable', async () => {
      // Arrange
      service.executeSuggestion.mockResolvedValue(
        new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND),
      );

      // Act
      const act = controller.apply(USER, { id: SUGGESTION_ID }, {});

      // Assert
      await expect(act).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('dismiss', () => {
    it('should return the dismissed message constant and service data', async () => {
      // Arrange
      const data = { id: SUGGESTION_ID, remaining: 1 };
      service.dismissSuggestion.mockResolvedValue(data);

      // Act
      const result = await controller.dismiss(USER, { id: SUGGESTION_ID });

      // Assert
      expect(result).toEqual({
        message: AI_MESSAGES.SUCCESS.SUGGESTION_DISMISSED,
        data,
      });
    });

    it('should throw NotFoundException when the suggestion is unavailable', async () => {
      // Arrange
      service.dismissSuggestion.mockResolvedValue(
        new NotFoundException(AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND),
      );

      // Act
      const act = controller.dismiss(USER, { id: SUGGESTION_ID });

      // Assert
      await expect(act).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
