import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { JOBS_MESSAGES } from 'src/common/constants/messages/jobs.messages';
import { JobStatus } from '../schemas/job.schema';

export class ListJobsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.PAGE_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.PAGE_MIN })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.LIMIT_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.LIMIT_MIN })
  @Max(50, { message: JOBS_MESSAGES.VALIDATION.LIMIT_MAX })
  limit?: number;

  @IsOptional()
  @IsString({ message: JOBS_MESSAGES.VALIDATION.SEARCH_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsMongoId({ message: JOBS_MESSAGES.VALIDATION.CLIENT_ID_INVALID })
  clientId?: string;

  @IsOptional()
  @IsEnum(JobStatus, { message: JOBS_MESSAGES.VALIDATION.STATUS_INVALID })
  status?: JobStatus;
}
