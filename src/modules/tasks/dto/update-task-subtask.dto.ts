import { IsBoolean } from 'class-validator';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';

export class UpdateTaskSubtaskDto {
  @IsBoolean({ message: TASKS_MESSAGES.VALIDATION.SUBTASK_COMPLETED_INVALID })
  completed: boolean;
}
