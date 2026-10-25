import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';
import { TaskPriority, TaskStage } from '../schemas/task.schema';

export class UpdateTaskDto {
  @IsOptional()
  @IsString({ message: TASKS_MESSAGES.VALIDATION.TITLE_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  title?: string;

  @IsOptional()
  @IsString({ message: TASKS_MESSAGES.VALIDATION.DESCRIPTION_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  description?: string;

  @IsOptional()
  @IsEnum(TaskStage, { message: TASKS_MESSAGES.VALIDATION.STAGE_INVALID })
  stage?: TaskStage;

  @IsOptional()
  @IsEnum(TaskPriority, {
    message: TASKS_MESSAGES.VALIDATION.PRIORITY_INVALID,
  })
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString({}, { message: TASKS_MESSAGES.VALIDATION.DUE_DATE_INVALID })
  dueDate?: string;

  @IsOptional()
  @IsMongoId({ message: TASKS_MESSAGES.VALIDATION.ASSIGNEE_ID_INVALID })
  assigneeId?: string;
}
