import { IsMongoId } from 'class-validator';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';

export class SuggestionIdParamDto {
  @IsMongoId({ message: AI_MESSAGES.VALIDATION.SUGGESTION_ID_INVALID })
  id: string;
}
