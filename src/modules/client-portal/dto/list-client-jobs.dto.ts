import { IsEnum, IsOptional } from 'class-validator';
import { JobStatus } from '../../jobs/schemas/job.schema';
import { ClientPaginationDto } from './client-pagination.dto';

export class ListClientJobsDto extends ClientPaginationDto {
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}
