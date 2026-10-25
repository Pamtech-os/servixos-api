import { IsEnum, IsOptional } from 'class-validator';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { InsightCategory, InsightSeverity } from '../types/ai-insights.types';

export class ListInsightsDto {
  @IsOptional()
  @IsEnum(InsightCategory, { message: AI_MESSAGES.VALIDATION.CATEGORY_INVALID })
  category?: InsightCategory;

  @IsOptional()
  @IsEnum(InsightSeverity, { message: AI_MESSAGES.VALIDATION.SEVERITY_INVALID })
  severity?: InsightSeverity;
}
