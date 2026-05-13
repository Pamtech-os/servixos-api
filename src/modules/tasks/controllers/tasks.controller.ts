import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { AddTaskAttachmentDto } from '../dto/add-task-attachment.dto';
import { AddTaskCommentDto } from '../dto/add-task-comment.dto';
import { AddTaskSubtaskDto } from '../dto/add-task-subtask.dto';
import { CreateTaskDto } from '../dto/create-task.dto';
import { ListTaskActivitiesDto } from '../dto/list-task-activities.dto';
import { ListTasksDto } from '../dto/list-tasks.dto';
import { SubtaskIdParamDto } from '../dto/subtask-id-param.dto';
import { TaskIdParamDto } from '../dto/task-id-param.dto';
import { UpdateTaskSubtaskDto } from '../dto/update-task-subtask.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';
import { TasksService } from '../services/tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listTasks(@CurrentUser() user: JwtUser, @Query() query: ListTasksDto) {
    const result = await this.tasksService.listTasks(user.businessId, query);
    if (result instanceof HttpException) throw result;

    return {
      message: TASKS_MESSAGES.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getTask(@CurrentUser() user: JwtUser, @Param() params: TaskIdParamDto) {
    const result = await this.tasksService.getTask(params.id, user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: TASKS_MESSAGES.SUCCESS.FOUND,
      data: result,
    };
  }

  @Get(':id/activities')
  @HttpCode(HttpStatus.OK)
  async listTaskActivities(
    @CurrentUser() user: JwtUser,
    @Param() params: TaskIdParamDto,
    @Query() query: ListTaskActivitiesDto,
  ) {
    const result = await this.tasksService.getTaskActivities(
      params.id,
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: TASKS_MESSAGES.SUCCESS.ACTIVITIES_RETRIEVED,
      data: result.data,
      meta: result.meta,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTask(@CurrentUser() user: JwtUser, @Body() dto: CreateTaskDto) {
    const result = await this.tasksService.createTask(
      user.businessId,
      user.sub,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: TASKS_MESSAGES.SUCCESS.CREATED,
      data: result,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateTask(
    @CurrentUser() user: JwtUser,
    @Param() params: TaskIdParamDto,
    @Body() dto: UpdateTaskDto,
  ) {
    const result = await this.tasksService.updateTask(
      params.id,
      user.businessId,
      user.sub,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: TASKS_MESSAGES.SUCCESS.UPDATED,
      data: result,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteTask(
    @CurrentUser() user: JwtUser,
    @Param() params: TaskIdParamDto,
  ) {
    const result = await this.tasksService.deleteTask(
      params.id,
      user.businessId,
      user.sub,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: TASKS_MESSAGES.SUCCESS.DELETED,
      data: null,
    };
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.OK)
  async addComment(
    @CurrentUser() user: JwtUser,
    @Param() params: TaskIdParamDto,
    @Body() dto: AddTaskCommentDto,
  ) {
    const result = await this.tasksService.addComment(
      params.id,
      user.businessId,
      user.sub,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: TASKS_MESSAGES.SUCCESS.COMMENT_ADDED,
      data: result,
    };
  }

  @Post(':id/attachments')
  @HttpCode(HttpStatus.CREATED)
  async addAttachment(
    @CurrentUser() user: JwtUser,
    @Param() params: TaskIdParamDto,
    @Body() dto: AddTaskAttachmentDto,
  ) {
    const result = await this.tasksService.addTaskAttachment(
      params.id,
      user.businessId,
      user.sub,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: TASKS_MESSAGES.SUCCESS.ATTACHMENT_UPLOADED,
      data: result,
    };
  }

  @Post(':id/subtasks')
  @HttpCode(HttpStatus.OK)
  async addSubtask(
    @CurrentUser() user: JwtUser,
    @Param() params: TaskIdParamDto,
    @Body() dto: AddTaskSubtaskDto,
  ) {
    const result = await this.tasksService.addSubtask(
      params.id,
      user.businessId,
      user.sub,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: TASKS_MESSAGES.SUCCESS.SUBTASK_ADDED,
      data: result,
    };
  }

  @Patch(':id/subtasks/:subtaskId')
  @HttpCode(HttpStatus.OK)
  async updateSubtask(
    @CurrentUser() user: JwtUser,
    @Param() params: SubtaskIdParamDto,
    @Body() dto: UpdateTaskSubtaskDto,
  ) {
    const result = await this.tasksService.updateSubtask(
      params.id,
      params.subtaskId,
      user.businessId,
      user.sub,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: TASKS_MESSAGES.SUCCESS.SUBTASK_UPDATED,
      data: result,
    };
  }
}
