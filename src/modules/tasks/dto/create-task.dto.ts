import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';
import { TaskPriority, TaskStage } from '../schemas/task.schema';

export class CreateTaskDto {
  @IsString({ message: TASKS_MESSAGES.VALIDATION.TITLE_INVALID })
  @IsNotEmpty({ message: TASKS_MESSAGES.VALIDATION.TITLE_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  title: string;

  @IsOptional()
  @IsString({ message: TASKS_MESSAGES.VALIDATION.DESCRIPTION_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  description?: string;

  @IsMongoId({ message: TASKS_MESSAGES.VALIDATION.ASSIGNEE_ID_INVALID })
  assigneeId: string;

  @IsOptional()
  @IsEnum(TaskPriority, {
    message: TASKS_MESSAGES.VALIDATION.PRIORITY_INVALID,
  })
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString({}, { message: TASKS_MESSAGES.VALIDATION.DUE_DATE_INVALID })
  dueDate?: string;

  @IsEnum(TaskStage, { message: TASKS_MESSAGES.VALIDATION.STAGE_INVALID })
  stage: TaskStage;
}
