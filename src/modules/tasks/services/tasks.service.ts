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
import type { Employee } from 'src/modules/employees/schemas/employee.schema';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { toBusinessLocalTime } from 'src/common/utils/timezone.util';
import { StorageService } from 'src/modules/storage/storage.service';
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
  actorEmail: string;
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
    private readonly storageService: StorageService,
  ) {}

  async onModuleInit(): Promise<void> {
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

    this.agendaService.define(
      JOBS.TASK_OVERDUE_NOTIFICATION,
      async (): Promise<void> => {
        await this.checkAndNotifyOverdueTasks();
      },
    );

    await this.agendaService.every('1 hour', JOBS.TASK_OVERDUE_NOTIFICATION);
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
        dto.assigneeId
          ? this.employeesRepository.findById(dto.assigneeId, bId)
          : Promise.resolve(null),
        this.resolveActor(userId, businessId),
        this.resolveBusinessTimezone(businessId),
      ]);

      if (dto.assigneeId && !assignee) {
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
        createdById: actor.actorId,
        assigneeId: assignee?._id,
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
          assigneeId: created.assigneeId?.toString(),
        },
        timezone,
      });

      if (assignee) {
        void this.agendaService.now(JOBS.EMAIL_TASK_ASSIGNED, {
          to: assignee.email,
          assigneeName: assignee.fullName,
          taskTitle: created.title,
          actorName: actor.actorName,
          priority: created.priority,
          dueDate: created.dueDate?.toISOString(),
        });
      }

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

      let newAssignee: Employee | null = null;
      if (dto.assigneeId) {
        newAssignee = await this.employeesRepository.findById(
          dto.assigneeId,
          bId,
        );
        if (!newAssignee) {
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

      const changes = this.buildTaskChangeSummary(dto, timezone);

      void this.dispatchTaskUpdateEmails({
        userId,
        existingAssigneeId: existing.assigneeId?.toString(),
        createdById: existing.createdById?.toString(),
        newAssignee,
        bId,
        actor,
        taskTitle: updated.title,
        changes,
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

      const updated = await this.tasksRepository.appendSubtask(id, bId, {
        _id: new Types.ObjectId(),
        title: dto.title,
        completed: false,
      });

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

      void this.dispatchTaskUpdateEmails({
        userId,
        existingAssigneeId: existing.assigneeId?.toString(),
        createdById: existing.createdById?.toString(),
        newAssignee: null,
        bId,
        actor,
        taskTitle: existing.title,
        changes: [`Added subtask "${dto.title}"`],
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

      const subtaskTitle =
        existing.subtasks.find((s) => s._id.toString() === subtaskId)?.title ??
        'Subtask';

      void this.dispatchTaskUpdateEmails({
        userId,
        existingAssigneeId: existing.assigneeId?.toString(),
        createdById: existing.createdById?.toString(),
        newAssignee: null,
        bId,
        actor,
        taskTitle: existing.title,
        changes: [
          `"${subtaskTitle}" marked as ${dto.completed ? 'completed' : 'incomplete'}`,
        ],
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

  /**
   * Records a pre-uploaded file as a task attachment. The file must have been
   * uploaded via POST /files/upload first; this call only appends the metadata.
   */
  async addTaskAttachment(
    id: string,
    businessId: string,
    userId: string,
    input: {
      url: string;
      publicId: string;
      filename: string;
      mimeType: string;
      filesizeBytes: number;
    },
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

      const updated = await this.tasksRepository.appendAttachment(id, bId, {
        _id: new Types.ObjectId(),
        url: input.url,
        publicId: input.publicId,
        filename: input.filename,
        mimeType: input.mimeType,
        filesizeBytes: input.filesizeBytes,
        uploadedBy: Types.ObjectId.isValid(userId)
          ? new Types.ObjectId(userId)
          : undefined,
        uploadedAt: toBusinessLocalTime(new Date(), timezone),
      });

      if (!updated) {
        return new NotFoundException(TASKS_MESSAGES.ERROR.NOT_FOUND);
      }

      await this.appendTaskActivity({
        businessId,
        taskId: id,
        actor,
        type: TaskActivityType.ATTACHMENT_ADDED,
        description: `Attached file "${input.filename}"`,
        metadata: { filename: input.filename },
        timezone,
      });

      await this.invalidateTasksListCache(businessId);
      return updated;
    } catch (error) {
      this.logger.error(
        `addTaskAttachment: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
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
      actorEmail: user.email,
    };
  }

  private async resolveBusinessTimezone(businessId: string): Promise<string> {
    const business = await this.businessRepository.findById(businessId);
    return business?.timezone ?? 'UTC';
  }

  /**
   * Runs every hour and emails assignees whose tasks are overdue in their
   * business local timezone. Fires only for businesses where the local hour
   * is currently 0 (midnight), and deduplicates via Redis so each assignee
   * receives at most one overdue email per task per calendar day.
   */
  private async checkAndNotifyOverdueTasks(): Promise<void> {
    const businesses = await this.businessRepository.findAllTimezones();
    const now = new Date();

    for (const business of businesses) {
      const timezone = business.timezone ?? 'UTC';
      const localNow = toBusinessLocalTime(now, timezone);

      // Only run for businesses where the local clock just turned midnight
      if (localNow.getUTCHours() !== 0) continue;

      // Start of today in the business timezone (stored as fake UTC)
      const todayStart = new Date(localNow);
      todayStart.setUTCHours(0, 0, 0, 0);

      // YYYY-MM-DD in the business local timezone, used for dedup key
      const localDate = todayStart.toISOString().slice(0, 10);

      const overdueTasks = await this.tasksRepository.findOverdueForBusiness(
        business._id,
        todayStart,
      );

      for (const task of overdueTasks) {
        const assignee = task.assigneeId;
        if (!assignee?.email) continue;

        // Deduplicate: skip if we already notified this assignee about this task today
        const dedupKey = `task_overdue_notified:${task._id.toString()}:${localDate}`;
        const alreadySent = await this.redisService.get(dedupKey);
        if (alreadySent) continue;

        const dueDateDisplay = task.dueDate
          ? new Date(task.dueDate).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })
          : 'N/A';

        void this.agendaService.now(JOBS.EMAIL_TASK_OVERDUE, {
          to: assignee.email,
          assigneeName: assignee.fullName,
          taskTitle: task.title,
          dueDate: dueDateDisplay,
        });

        // TTL slightly over 24 h to survive DST transitions
        await this.redisService.set(dedupKey, '1', 25 * 60 * 60);
      }
    }
  }

  /**
   * Sends background email notifications after a task is created or updated.
   *
   * - New assignee set → notify them they were assigned.
   * - Actor is the existing assignee → notify the task creator (they updated their own task).
   * - Actor is not the assignee → notify the assignee (someone else changed their task).
   */
  private async dispatchTaskUpdateEmails(params: {
    userId: string;
    existingAssigneeId?: string;
    createdById?: string;
    newAssignee: Employee | null;
    bId: Types.ObjectId;
    actor: ResolvedActor;
    taskTitle: string;
    changes: string[];
  }): Promise<void> {
    const {
      userId,
      existingAssigneeId,
      createdById,
      newAssignee,
      bId,
      actor,
      taskTitle,
      changes,
    } = params;

    if (newAssignee) {
      void this.agendaService.now(JOBS.EMAIL_TASK_ASSIGNED, {
        to: newAssignee.email,
        assigneeName: newAssignee.fullName,
        taskTitle,
        actorName: actor.actorName,
      });
      return;
    }

    if (!existingAssigneeId) return;

    const existingAssignee = await this.employeesRepository.findById(
      existingAssigneeId,
      bId,
    );

    const actorIsAssignee = existingAssignee?.userId?.toString() === userId;

    if (actorIsAssignee) {
      if (!createdById) return;
      const creator = await this.usersRepository.findById(createdById);
      if (!creator) return;

      void this.agendaService.now(JOBS.EMAIL_TASK_UPDATED_ACTOR, {
        to: creator.email,
        actorName: `${creator.firstName} ${creator.lastName}`.trim(),
        taskTitle,
        assigneeName: actor.actorName,
        changes,
      });
    } else if (existingAssignee) {
      void this.agendaService.now(JOBS.EMAIL_TASK_UPDATED_ASSIGNEE, {
        to: existingAssignee.email,
        assigneeName: existingAssignee.fullName,
        taskTitle,
        actorName: actor.actorName,
        changes,
      });
    }
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

  /** Builds a human-readable list of what changed for task update emails. */
  private buildTaskChangeSummary(
    dto: UpdateTaskDto,
    timezone: string,
  ): string[] {
    const changes: string[] = [];

    if (dto.title !== undefined) {
      changes.push(`Title changed to "${dto.title}"`);
    }
    if (dto.description !== undefined) {
      changes.push('Description updated');
    }
    if (dto.priority !== undefined) {
      const label =
        dto.priority.charAt(0).toUpperCase() + dto.priority.slice(1);
      changes.push(`Priority set to ${label}`);
    }
    if (dto.stage !== undefined) {
      const label = dto.stage
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      changes.push(`Stage moved to ${label}`);
    }
    if (dto.dueDate !== undefined) {
      if (dto.dueDate) {
        const display = toBusinessLocalTime(
          new Date(dto.dueDate),
          timezone,
        ).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
        changes.push(`Due date set to ${display}`);
      } else {
        changes.push('Due date removed');
      }
    }

    return changes;
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
