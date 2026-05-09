import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { EMPLOYEES_MESSAGES } from 'src/common/constants/messages/employees.messages';

export class QueryEmployeesDto {
  @IsOptional()
  @IsString({ message: EMPLOYEES_MESSAGES.VALIDATION.SEARCH_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsMongoId({ message: EMPLOYEES_MESSAGES.VALIDATION.ROLE_ID_INVALID })
  roleId?: string;

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
