import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';

export class AddTaskSubtaskDto {
  @IsString({ message: TASKS_MESSAGES.VALIDATION.SUBTASK_TITLE_INVALID })
  @IsNotEmpty({ message: TASKS_MESSAGES.VALIDATION.SUBTASK_TITLE_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  title: string;
}
