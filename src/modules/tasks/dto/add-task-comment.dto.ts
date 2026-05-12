import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';

export class AddTaskCommentDto {
  @IsString({ message: TASKS_MESSAGES.VALIDATION.COMMENT_CONTENT_INVALID })
  @IsNotEmpty({ message: TASKS_MESSAGES.VALIDATION.COMMENT_CONTENT_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  content: string;
}
