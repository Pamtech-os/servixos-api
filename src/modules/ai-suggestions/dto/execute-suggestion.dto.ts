import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';

export const DRAFT_VALUE_MAX_LENGTH = 5000;

export class ExecuteSuggestionDto {
  /** The user's edited draft. Only sent for suggestions that have a draft; overrides the original. */
  @IsOptional()
  @IsString({ message: AI_MESSAGES.VALIDATION.DRAFT_VALUE_INVALID })
  @MaxLength(DRAFT_VALUE_MAX_LENGTH, {
    message: AI_MESSAGES.VALIDATION.DRAFT_VALUE_TOO_LONG,
  })
  draftValue?: string;
}
