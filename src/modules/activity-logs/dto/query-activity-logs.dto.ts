import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ACTIVITY_LOGS_MESSAGES } from 'src/common/constants/messages/activity-logs.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { LogCategory } from '../schemas/activity-log.schema';

export class QueryActivityLogsDto {
  @IsOptional()
  @IsString({ message: COMMON_MESSAGES.VALIDATION.STRING_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsEnum(LogCategory, {
    message: ACTIVITY_LOGS_MESSAGES.VALIDATION.CATEGORY_INVALID,
  })
  category?: LogCategory;

  @IsOptional()
  @IsDateString(
    {},
    { message: ACTIVITY_LOGS_MESSAGES.VALIDATION.DATE_FROM_INVALID },
  )
  dateFrom?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: ACTIVITY_LOGS_MESSAGES.VALIDATION.DATE_TO_INVALID },
  )
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.PAGE_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.PAGE_MIN })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.LIMIT_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.LIMIT_MIN })
  @Max(100, { message: ACTIVITY_LOGS_MESSAGES.VALIDATION.LIMIT_MAX })
  limit?: number;
}
