import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { EMPLOYEES_MESSAGES } from 'src/common/constants/messages/employees.messages';

export class QueryClockHistoryDto {
  @IsOptional()
  @IsDateString(
    {},
    { message: EMPLOYEES_MESSAGES.VALIDATION.START_DATE_INVALID },
  )
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: EMPLOYEES_MESSAGES.VALIDATION.END_DATE_INVALID })
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.PAGE_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.PAGE_MIN })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.LIMIT_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.LIMIT_MIN })
  @Max(50, { message: EMPLOYEES_MESSAGES.VALIDATION.LIMIT_MAX })
  limit?: number;
}
