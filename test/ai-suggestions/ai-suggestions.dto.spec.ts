import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import {
  DRAFT_VALUE_MAX_LENGTH,
  ExecuteSuggestionDto,
} from 'src/modules/ai-suggestions/dto/execute-suggestion.dto';
import { SuggestionIdParamDto } from 'src/modules/ai-suggestions/dto/suggestion-id-param.dto';

describe('AI suggestion DTOs', () => {
  describe('SuggestionIdParamDto', () => {
    it('should accept a valid ObjectId', async () => {
      // Arrange
      const dto = plainToInstance(SuggestionIdParamDto, {
        id: '665f1c2b9d3e4a0012345678',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should reject a legacy fixed suggestion id', async () => {
      // Arrange
      const dto = plainToInstance(SuggestionIdParamDto, {
        id: 'send-payment-reminders',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors[0].constraints).toEqual({
        isMongoId: AI_MESSAGES.VALIDATION.SUGGESTION_ID_INVALID,
      });
    });
  });

  describe('ExecuteSuggestionDto', () => {
    it('should accept an empty body', async () => {
      // Arrange
      const dto = plainToInstance(ExecuteSuggestionDto, {});

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should reject a non-string draftValue', async () => {
      // Arrange
      const dto = plainToInstance(ExecuteSuggestionDto, { draftValue: 42 });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors[0].constraints).toMatchObject({
        isString: AI_MESSAGES.VALIDATION.DRAFT_VALUE_INVALID,
      });
    });

    it('should reject a draftValue over the maximum length', async () => {
      // Arrange
      const dto = plainToInstance(ExecuteSuggestionDto, {
        draftValue: 'a'.repeat(DRAFT_VALUE_MAX_LENGTH + 1),
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors[0].constraints).toEqual({
        maxLength: AI_MESSAGES.VALIDATION.DRAFT_VALUE_TOO_LONG,
      });
    });
  });
});
