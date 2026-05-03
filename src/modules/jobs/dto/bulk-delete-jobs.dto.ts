import { ArrayMinSize, IsArray, IsMongoId } from 'class-validator';
import { JOBS_MESSAGES } from 'src/common/constants/messages/jobs.messages';

export class BulkDeleteJobsDto {
  @IsArray({ message: JOBS_MESSAGES.VALIDATION.IDS_ARRAY_REQUIRED })
  @ArrayMinSize(1, { message: JOBS_MESSAGES.VALIDATION.IDS_ARRAY_REQUIRED })
  @IsMongoId({ each: true, message: JOBS_MESSAGES.VALIDATION.ID_INVALID })
  ids: string[];
}
