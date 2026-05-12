import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';

export class ListTaskActivitiesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.PAGE_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.PAGE_MIN })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.LIMIT_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.LIMIT_MIN })
  limit?: number;
}
