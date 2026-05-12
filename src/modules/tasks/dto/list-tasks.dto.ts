import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Min,
} from 'class-validator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';
import { TaskPriority, TaskStage } from '../schemas/task.schema';

export class ListTasksDto {
  @IsOptional()
  @IsMongoId({ message: TASKS_MESSAGES.VALIDATION.ASSIGNEE_ID_INVALID })
  assigneeId?: string;

  @IsOptional()
  @IsEnum(TaskStage, { message: TASKS_MESSAGES.VALIDATION.STAGE_INVALID })
  stage?: TaskStage;

  @IsOptional()
  @IsEnum(TaskPriority, { message: TASKS_MESSAGES.VALIDATION.PRIORITY_INVALID })
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString({}, { message: TASKS_MESSAGES.VALIDATION.DUE_DATE_INVALID })
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.PAGE_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.PAGE_MIN })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.LIMIT_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.LIMIT_MIN })
  limit?: number;
}
