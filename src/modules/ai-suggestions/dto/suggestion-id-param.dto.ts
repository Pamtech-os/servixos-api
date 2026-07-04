import { IsEnum } from 'class-validator';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { SuggestionId } from '../types/ai-suggestions.types';

export class SuggestionIdParamDto {
  @IsEnum(SuggestionId, {
    message: AI_MESSAGES.VALIDATION.SUGGESTION_ID_INVALID,
  })
  id: SuggestionId;
}
