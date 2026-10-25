import { IsMongoId } from 'class-validator';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';

export class TaskIdParamDto {
  @IsMongoId({ message: TASKS_MESSAGES.VALIDATION.ID_INVALID })
  id: string;
}
