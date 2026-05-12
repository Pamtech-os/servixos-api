import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Job as AgendaJob } from 'agenda';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { JOBS } from 'src/common/constants/agenda.constants';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { toBusinessLocalTime } from 'src/common/utils/timezone.util';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { AddTaskCommentDto } from '../dto/add-task-comment.dto';
import { AddTaskSubtaskDto } from '../dto/add-task-subtask.dto';
import { CreateTaskDto } from '../dto/create-task.dto';
import { ListTaskActivitiesDto } from '../dto/list-task-activities.dto';
import { ListTasksDto } from '../dto/list-tasks.dto';
import { UpdateTaskSubtaskDto } from '../dto/update-task-subtask.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';
import { TasksRepository } from '../repositories/tasks.repository';
import {
  TaskActivity,
  TaskActivityMetadata,
  TaskActivityType,
} from '../schemas/task-activity.schema';
import { Task, TaskStage } from '../schemas/task.schema';

interface PaginatedTasks {
  data: Task[];
  meta: ReturnType<typeof buildMeta>;
}

interface PaginatedTaskActivities {
  data: TaskActivity[];
  meta: ReturnType<typeof buildMeta>;
}

interface TaskStagesBootstrapJobData {
  businessId: string;
}

interface ResolvedActor {
  actorId: Types.ObjectId;
  actorName: string;
}

interface StageSeed {
  key: TaskStage;
  name: string;
  order: number;
}

const tasksListCacheKey = (businessId: string, paramsHash: string): string =>
  `${businessId}:tasks:list:${paramsHash}`;

const DEFAULT_TASK_STAGES: StageSeed[] = [
  { key: TaskStage.TODO, name: 'To Do', order: 1 },
  { key: TaskStage.IN_PROGRESS, name: 'In Progress', order: 2 },
  { key: TaskStage.COMPLETED, name: 'Completed', order: 3 },
];

@Injectable()
export class TasksService implements OnModuleInit {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly redisService: RedisService,
    private readonly agendaService: AgendaService,
  ) {}

  onModuleInit(): void {
    this.agendaService.define(
      JOBS.TASK_STAGES_BOOTSTRAP,
      async (job: AgendaJob): Promise<void> => {
        const payload = job.attrs.data as
          | TaskStagesBootstrapJobData
          | undefined;

        if (
          !payload?.businessId ||
          !Types.ObjectId.isValid(payload.businessId)
        ) {
          this.logger.warn(
            `${JOBS.TASK_STAGES_BOOTSTRAP}: missing or invalid businessId`,
          );
          return;
        }

        await this.bootstrapDefaultStages(payload.businessId);
      },
    );
  }

  async listTasks(
    businessId: string,
    dto: ListTasksDto,
  ): Promise<PaginatedTasks | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit ?? 20);
      const paramsHash = createHash('sha1')
        .update(
          JSON.stringify({
            assigneeId: dto.assigneeId ?? '',
            stage: dto.stage ?? '',
            priority: dto.priority ?? '',
            dueDate: dto.dueDate ?? '',
            page: pagination.page,
            limit: pagination.limit,
          }),
        )
        .digest('hex');

      const cacheKey = tasksListCacheKey(businessId, paramsHash);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as PaginatedTasks;
      }

      const { data, total } = await this.tasksRepository.findAll(
        new Types.ObjectId(businessId),
        {
          assigneeId: dto.assigneeId,
          stage: dto.stage,
          priority: dto.priority,
          dueDate: dto.dueDate,
        },
        pagination,
      );

      const result: PaginatedTasks = {
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.TASKS_LIST)
        .catch(() => undefined);

      return result;
    } catch (error) {
      this.logger.error(
        `listTasks: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getTask(
    id: string,
    businessId: string,
  ): Promise<Task | NotFoundException | InternalServerErrorException> {
    try {
      const task = await this.tasksRepository.findById(
        id,
        new Types.ObjectId(businessId),
      );
      if (!task) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.NOT_FOUND);
      }

      return task;
    } catch (error) {
      this.logger.error(
        `getTask: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getTaskActivities(
    id: string,
    businessId: string,
    query: ListTaskActivitiesDto,
  ): Promise<
    PaginatedTaskActivities | NotFoundException | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const task = await this.tasksRepository.findById(id, bId, false);
      if (!task) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.NOT_FOUND);
      }

      const pagination = resolvePagination(query.page, query.limit ?? 20);
      const { data, total } = await this.tasksRepository.findActivitiesByTask(
        id,
        bId,
        pagination,
      );

      return {
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    } catch (error) {
      this.logger.error(
        `getTaskActivities: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createTask(
    businessId: string,
    userId: string,
    dto: CreateTaskDto,
  ): Promise<
    | Task
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const [assignee, actor, timezone] = await Promise.all([
        this.employeesRepository.findById(dto.assigneeId, bId),
        this.resolveActor(userId, businessId),
        this.resolveBusinessTimezone(businessId),
      ]);

      if (!assignee) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.ASSIGNEE_NOT_FOUND);
      }

      if (actor instanceof NotFoundException) {
        return actor;
      }

      const stageExists = await this.resolveStageForBusiness(
        businessId,
        dto.stage,
      );
      if (stageExists instanceof HttpStageError) {
        return stageExists.error;
      }

      const created = await this.tasksRepository.create({
        businessId: bId,
        assigneeId: assignee._id,
        title: dto.title,
        description: dto.description,
        stage: dto.stage,
        priority: dto.priority,
        dueDate: dto.dueDate
          ? toBusinessLocalTime(new Date(dto.dueDate), timezone)
          : undefined,
        subtasks: [],
        comments: [],
      });

      await this.appendTaskActivity({
        businessId,
        taskId: created._id.toString(),
        actor,
        type: TaskActivityType.TASK_CREATED,
        description: `Created task "${created.title}"`,
        metadata: {
          stage: created.stage,
          assigneeId: created.assigneeId.toString(),
        },
        timezone,
      });

      await this.invalidateTasksListCache(businessId);
      return created;
    } catch (error) {
      this.logger.error(
        `createTask: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async updateTask(
    id: string,
    businessId: string,
    userId: string,
    dto: UpdateTaskDto,
  ): Promise<
    | Task
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const [existing, actor, timezone] = await Promise.all([
        this.tasksRepository.findById(id, bId, false),
        this.resolveActor(userId, businessId),
        this.resolveBusinessTimezone(businessId),
      ]);

      if (!existing) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (actor instanceof NotFoundException) {
        return actor;
      }

      if (dto.assigneeId) {
        const assignee = await this.employeesRepository.findById(
          dto.assigneeId,
          bId,
        );
        if (!assignee) {
          return new NotFoundException(TASKS_MESSAGES.ERROR.ASSIGNEE_NOT_FOUND);
        }
      }

      const normalized: Partial<Task> = {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.assigneeId !== undefined && {
          assigneeId: new Types.ObjectId(dto.assigneeId),
        }),
        ...(dto.dueDate !== undefined && {
          dueDate: dto.dueDate
            ? toBusinessLocalTime(new Date(dto.dueDate), timezone)
            : undefined,
        }),
      };

      if (dto.stage !== undefined) {
        const stageExists = await this.resolveStageForBusiness(
          businessId,
          dto.stage,
        );
        if (stageExists instanceof HttpStageError) {
          return stageExists.error;
        }

        normalized.stage = dto.stage;
      }

      const updated = await this.tasksRepository.updateById(
        id,
        bId,
        normalized,
      );
      if (!updated) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.NOT_FOUND);
      }

      await this.appendTaskActivity({
        businessId,
        taskId: id,
        actor,
        type: TaskActivityType.TASK_UPDATED,
        description: `Updated task "${updated.title}"`,
        metadata: {
          updatedFields: Object.keys(normalized),
        },
        timezone,
      });

      await this.invalidateTasksListCache(businessId);
      return updated;
    } catch (error) {
      this.logger.error(
        `updateTask: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async deleteTask(
    id: string,
    businessId: string,
    userId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const [actor, timezone] = await Promise.all([
        this.resolveActor(userId, businessId),
        this.resolveBusinessTimezone(businessId),
      ]);

      if (actor instanceof NotFoundException) {
        return actor;
      }

      const deleted = await this.tasksRepository.softDelete(
        id,
        new Types.ObjectId(businessId),
      );
      if (!deleted) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.NOT_FOUND);
      }

      await this.appendTaskActivity({
        businessId,
        taskId: id,
        actor,
        type: TaskActivityType.TASK_DELETED,
        description: `Deleted task "${deleted.title}"`,
        timezone,
      });

      await this.invalidateTasksListCache(businessId);
      return null;
    } catch (error) {
      this.logger.error(
        `deleteTask: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async addComment(
    id: string,
    businessId: string,
    userId: string,
    dto: AddTaskCommentDto,
  ): Promise<Task | NotFoundException | InternalServerErrorException> {
    try {
      const bId = new Types.ObjectId(businessId);
      const [existing, actor, timezone] = await Promise.all([
        this.tasksRepository.findById(id, bId, false),
        this.resolveActor(userId, businessId),
        this.resolveBusinessTimezone(businessId),
      ]);

      if (!existing) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (actor instanceof NotFoundException) {
        return actor;
      }

      const updated = await this.tasksRepository.appendComment(id, bId, {
        _id: new Types.ObjectId(),
        authorId: actor.actorId,
        authorName: actor.actorName,
        content: dto.content,
        createdAt: toBusinessLocalTime(new Date(), timezone),
      });

      if (!updated) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.NOT_FOUND);
      }

      await this.appendTaskActivity({
        businessId,
        taskId: id,
        actor,
        type: TaskActivityType.COMMENT_ADDED,
        description: 'Added a task comment',
        metadata: {
          content: dto.content,
        },
        timezone,
      });

      await this.invalidateTasksListCache(businessId);
      return updated;
    } catch (error) {
      this.logger.error(
        `addComment: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async addSubtask(
    id: string,
    businessId: string,
    userId: string,
    dto: AddTaskSubtaskDto,
  ): Promise<Task | NotFoundException | InternalServerErrorException> {
    try {
      const [actor, timezone] = await Promise.all([
        this.resolveActor(userId, businessId),
        this.resolveBusinessTimezone(businessId),
      ]);

      if (actor instanceof NotFoundException) {
        return actor;
      }

      const updated = await this.tasksRepository.appendSubtask(
        id,
        new Types.ObjectId(businessId),
        {
          _id: new Types.ObjectId(),
          title: dto.title,
          completed: false,
        },
      );

      if (!updated) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.NOT_FOUND);
      }

      await this.appendTaskActivity({
        businessId,
        taskId: id,
        actor,
        type: TaskActivityType.SUBTASK_ADDED,
        description: `Added subtask "${dto.title}"`,
        timezone,
      });

      await this.invalidateTasksListCache(businessId);
      return updated;
    } catch (error) {
      this.logger.error(
        `addSubtask: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async updateSubtask(
    id: string,
    subtaskId: string,
    businessId: string,
    userId: string,
    dto: UpdateTaskSubtaskDto,
  ): Promise<Task | NotFoundException | InternalServerErrorException> {
    try {
      const bId = new Types.ObjectId(businessId);
      const [existing, actor, timezone] = await Promise.all([
        this.tasksRepository.findById(id, bId, false),
        this.resolveActor(userId, businessId),
        this.resolveBusinessTimezone(businessId),
      ]);

      if (!existing) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (actor instanceof NotFoundException) {
        return actor;
      }

      const hasSubtask = existing.subtasks.some(
        (subtask) => subtask._id.toString() === subtaskId,
      );
      if (!hasSubtask) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.SUBTASK_NOT_FOUND);
      }

      const updated = await this.tasksRepository.updateSubtaskCompletion(
        id,
        bId,
        subtaskId,
        dto.completed,
      );

      if (!updated) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.SUBTASK_NOT_FOUND);
      }

      await this.appendTaskActivity({
        businessId,
        taskId: id,
        actor,
        type: TaskActivityType.SUBTASK_UPDATED,
        description: `Marked subtask as ${dto.completed ? 'completed' : 'incomplete'}`,
        metadata: {
          subtaskId,
          completed: dto.completed,
        },
        timezone,
      });

      await this.invalidateTasksListCache(businessId);
      return updated;
    } catch (error) {
      this.logger.error(
        `updateSubtask: failed [id=${id}, subtaskId=${subtaskId}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async bootstrapDefaultStages(
    businessId: string,
  ): Promise<null | InternalServerErrorException> {
    try {
      await this.tasksRepository.upsertDefaultStages(
        new Types.ObjectId(businessId),
        DEFAULT_TASK_STAGES,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `bootstrapDefaultStages: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private async resolveStageForBusiness(
    businessId: string,
    stage: TaskStage,
  ): Promise<true | HttpStageError> {
    const bId = new Types.ObjectId(businessId);
    let stageDefinition = await this.tasksRepository.findStageByKey(bId, stage);

    // Background bootstrap can be slightly delayed after onboarding.
    // If a task is created immediately, we upsert the defaults lazily to avoid
    // rejecting a valid request due to eventual queue execution timing.
    if (!stageDefinition) {
      await this.tasksRepository.upsertDefaultStages(bId, DEFAULT_TASK_STAGES);
      stageDefinition = await this.tasksRepository.findStageByKey(bId, stage);
    }

    if (!stageDefinition) {
      return new HttpStageError(
        new BadRequestException(TASKS_MESSAGES.ERROR.STAGE_NOT_FOUND),
      );
    }

    return true;
  }

  private async resolveActor(
    userId: string,
    businessId: string,
  ): Promise<ResolvedActor | NotFoundException> {
    const [user, employee] = await Promise.all([
      this.usersRepository.findById(userId),
      this.employeesRepository.findByUserId(
        userId,
        new Types.ObjectId(businessId),
      ),
    ]);

    if (
      !user ||
      user.deletedAt ||
      !user.businessId ||
      user.businessId.toString() !== businessId
    ) {
      return new NotFoundException(TASKS_MESSAGES.ERROR.USER_NOT_IN_BUSINESS);
    }

    return {
      actorId: user._id,
      actorName:
        employee?.fullName ?? `${user.firstName} ${user.lastName}`.trim(),
    };
  }

  private async resolveBusinessTimezone(businessId: string): Promise<string> {
    const business = await this.businessRepository.findById(businessId);
    return business?.timezone ?? 'UTC';
  }

  /**
   * Writes a task timeline entry for auditability and UI history rendering.
   *
   * Example:
   * - User moves stage from `todo` to `in_progress`
   * - We persist type=`task_updated` with actor, description, and metadata
   * - GET /tasks/:id/activities returns this entry newest-first
   */
  private async appendTaskActivity(params: {
    businessId: string;
    taskId: string;
    actor: ResolvedActor;
    type: TaskActivityType;
    description: string;
    metadata?: TaskActivityMetadata;
    timezone: string;
  }): Promise<void> {
    await this.tasksRepository.createActivity({
      businessId: new Types.ObjectId(params.businessId),
      taskId: new Types.ObjectId(params.taskId),
      actorId: params.actor.actorId,
      actorName: params.actor.actorName,
      type: params.type,
      description: params.description,
      metadata: params.metadata,
      createdAt: toBusinessLocalTime(new Date(), params.timezone),
    });
  }

  private async invalidateTasksListCache(businessId: string): Promise<void> {
    await Promise.resolve(
      this.redisService.delByPattern(`${businessId}:tasks:list:*`),
    ).catch(() => 0);
  }
}

class HttpStageError {
  constructor(readonly error: BadRequestException) {}
}
