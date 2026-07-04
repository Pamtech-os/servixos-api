import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { AdvisorTopic } from '../types/ai-advisor.types';

export class AskAdvisorDto {
  @IsString({ message: AI_MESSAGES.VALIDATION.QUESTION_INVALID })
  @MinLength(1, { message: AI_MESSAGES.VALIDATION.QUESTION_REQUIRED })
  @MaxLength(500, { message: AI_MESSAGES.VALIDATION.QUESTION_TOO_LONG })
  @Transform(({ value }: { value: string }) => value?.trim())
  question: string;

  /** Set by the preset topic buttons (pricing/marketing/operations) to skip keyword classification. */
  @IsOptional()
  @IsEnum(AdvisorTopic, { message: AI_MESSAGES.VALIDATION.TOPIC_INVALID })
  topic?: AdvisorTopic;
}
