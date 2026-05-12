import { IsMongoId } from 'class-validator';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';

export class SubtaskIdParamDto {
  @IsMongoId({ message: TASKS_MESSAGES.VALIDATION.ID_INVALID })
  id: string;

  @IsMongoId({ message: TASKS_MESSAGES.VALIDATION.SUBTASK_ID_INVALID })
  subtaskId: string;
}
