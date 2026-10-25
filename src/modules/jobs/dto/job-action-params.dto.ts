import { IsMongoId } from 'class-validator';
import { JOBS_MESSAGES } from 'src/common/constants/messages/jobs.messages';

export class JobActionParamsDto {
  @IsMongoId({ message: JOBS_MESSAGES.VALIDATION.JOB_ID_INVALID })
  id: string;
}
