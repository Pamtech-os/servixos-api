import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';

export class QueryClientsDto {
  @IsOptional()
  @IsString({ message: CLIENTS_MESSAGES.VALIDATION.SEARCH_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.PAGE_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.PAGE_MIN })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.LIMIT_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.LIMIT_MIN })
  @Max(50, { message: CLIENTS_MESSAGES.VALIDATION.LIMIT_MAX })
  limit?: number;
}
