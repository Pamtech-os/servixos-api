import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { Task, TaskPriority, TaskStage } from '../schemas/task.schema';
import {
  TaskActivity,
  TaskActivityMetadata,
  TaskActivityType,
} from '../schemas/task-activity.schema';
import { TaskStageDefinition } from '../schemas/task-stage.schema';

interface ListTasksFilters {
  assigneeId?: string;
  stage?: TaskStage;
  priority?: TaskPriority;
  dueDate?: string;
}

interface TaskCommentInput {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string;
  content: string;
  createdAt: Date;
}

interface SubtaskInput {
  _id: Types.ObjectId;
  title: string;
  completed: boolean;
}

interface TaskStageSeedInput {
  key: TaskStage;
  name: string;
  order: number;
}

type PopulatedEmployee = {
  _id: Types.ObjectId;
  fullName: string;
};

type TaskWithMetadata = Task & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
  assigneeId: Types.ObjectId | PopulatedEmployee;
};

type TaskActivityWithMetadata = TaskActivity & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
};

type TaskStageWithMetadata = TaskStageDefinition & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
};

@Injectable()
export class TasksRepository {
  private readonly taskModel: ReturnModelType<typeof Task>;
  private readonly taskStageModel: ReturnModelType<typeof TaskStageDefinition>;
  private readonly taskActivityModel: ReturnModelType<typeof TaskActivity>;

  constructor(@InjectConnection() connection: Connection) {
    this.taskModel = getModelForClass(Task, {
      existingConnection: connection,
    });
    this.taskStageModel = getModelForClass(TaskStageDefinition, {
      existingConnection: connection,
    });
    this.taskActivityModel = getModelForClass(TaskActivity, {
      existingConnection: connection,
    });
  }

  async findAll(
    businessId: Types.ObjectId,
    filters: ListTasksFilters,
    pagination: PaginationParams,
  ): Promise<{ data: Task[]; total: number }> {
    const query: Record<string, unknown> = {
      businessId,
      deletedAt: null,
    };

    if (filters.assigneeId) {
      query['assigneeId'] = new Types.ObjectId(filters.assigneeId);
    }

    if (filters.stage) {
      query['stage'] = filters.stage;
    }

    if (filters.priority) {
      query['priority'] = filters.priority;
    }

    if (filters.dueDate) {
      const start = new Date(filters.dueDate);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      query['dueDate'] = { $gte: start, $lt: end };
    }

    const [data, total] = await Promise.all([
      this.taskModel
        .find(query)
        .populate({ path: 'assigneeId', select: 'fullName' })
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<TaskWithMetadata[]>()
        .exec(),
      this.taskModel.countDocuments(query).exec(),
    ]);

    return {
      data: data.map((row) => this.sanitizeTask(row)!),
      total,
    };
  }

  async findById(
    id: string,
    businessId: Types.ObjectId,
    populateAssignee = true,
  ): Promise<Task | null> {
    const query = this.taskModel.findOne({
      _id: id,
      businessId,
      deletedAt: null,
    });

    if (populateAssignee) {
      query.populate({ path: 'assigneeId', select: 'fullName' });
    }

    const row = await query.lean<TaskWithMetadata>().exec();
    return this.sanitizeTask(row);
  }

  async create(data: Partial<Task>, session?: ClientSession): Promise<Task> {
    const [created] = await this.taskModel.create([data], { session });
    return this.sanitizeTask(created.toObject() as TaskWithMetadata) as Task;
  }

  async updateById(
    id: string,
    businessId: Types.ObjectId,
    update: Partial<Task>,
    session?: ClientSession,
  ): Promise<Task | null> {
    const op = this.buildUpdateOperator(update);
    const updated = await this.taskModel
      .findOneAndUpdate({ _id: id, businessId, deletedAt: null }, op, {
        returnDocument: 'after',
        session,
      })
      .lean<TaskWithMetadata>()
      .exec();

    return this.sanitizeTask(updated);
  }

  async softDelete(
    id: string,
    businessId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Task | null> {
    const deleted = await this.taskModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { returnDocument: 'after', session },
      )
      .lean<TaskWithMetadata>()
      .exec();

    return this.sanitizeTask(deleted);
  }

  async appendComment(
    id: string,
    businessId: Types.ObjectId,
    comment: TaskCommentInput,
    session?: ClientSession,
  ): Promise<Task | null> {
    const updated = await this.taskModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $push: { comments: comment } },
        { returnDocument: 'after', session },
      )
      .lean<TaskWithMetadata>()
      .exec();

    return this.sanitizeTask(updated);
  }

  async appendSubtask(
    id: string,
    businessId: Types.ObjectId,
    subtask: SubtaskInput,
    session?: ClientSession,
  ): Promise<Task | null> {
    const updated = await this.taskModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $push: { subtasks: subtask } },
        { returnDocument: 'after', session },
      )
      .lean<TaskWithMetadata>()
      .exec();

    return this.sanitizeTask(updated);
  }

  async updateSubtaskCompletion(
    id: string,
    businessId: Types.ObjectId,
    subtaskId: string,
    completed: boolean,
    session?: ClientSession,
  ): Promise<Task | null> {
    const updated = await this.taskModel
      .findOneAndUpdate(
        {
          _id: id,
          businessId,
          deletedAt: null,
          'subtasks._id': new Types.ObjectId(subtaskId),
        },
        {
          $set: {
            'subtasks.$.completed': completed,
          },
        },
        {
          returnDocument: 'after',
          session,
        },
      )
      .lean<TaskWithMetadata>()
      .exec();

    return this.sanitizeTask(updated);
  }

  async upsertDefaultStages(
    businessId: Types.ObjectId,
    stages: TaskStageSeedInput[],
    session?: ClientSession,
  ): Promise<void> {
    if (!stages.length) return;

    const operations = stages.map((stage) => ({
      updateOne: {
        filter: {
          businessId,
          key: stage.key,
        },
        update: {
          $setOnInsert: {
            businessId,
            key: stage.key,
            name: stage.name,
            order: stage.order,
            isSystem: true,
          },
        },
        upsert: true,
      },
    }));

    const bulk = this.taskStageModel.bulkWrite(operations, {
      ordered: false,
      session,
    });

    await bulk;
  }

  async findStageByKey(
    businessId: Types.ObjectId,
    key: TaskStage,
  ): Promise<TaskStageDefinition | null> {
    const row = await this.taskStageModel
      .findOne({
        businessId,
        key,
        deletedAt: null,
      })
      .lean<TaskStageWithMetadata>()
      .exec();

    return this.sanitizeStage(row);
  }

  async createActivity(
    data: {
      businessId: Types.ObjectId;
      taskId: Types.ObjectId;
      actorId: Types.ObjectId;
      actorName: string;
      type: TaskActivityType;
      description: string;
      metadata?: TaskActivityMetadata;
      createdAt?: Date;
    },
    session?: ClientSession,
  ): Promise<TaskActivity> {
    const [created] = await this.taskActivityModel.create([data], { session });
    return this.sanitizeActivity(
      created.toObject() as TaskActivityWithMetadata,
    ) as TaskActivity;
  }

  async findActivitiesByTask(
    taskId: string,
    businessId: Types.ObjectId,
    pagination: PaginationParams,
  ): Promise<{ data: TaskActivity[]; total: number }> {
    const query = {
      businessId,
      taskId: new Types.ObjectId(taskId),
    };

    const [data, total] = await Promise.all([
      this.taskActivityModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<TaskActivityWithMetadata[]>()
        .exec(),
      this.taskActivityModel.countDocuments(query).exec(),
    ]);

    return {
      data: data.map((activity) => this.sanitizeActivity(activity)!),
      total,
    };
  }

  private buildUpdateOperator(update: Partial<Task>): Record<string, unknown> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};

    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) {
        $unset[key] = '';
      } else {
        $set[key] = value;
      }
    }

    const op: Record<string, unknown> = {};
    if (Object.keys($set).length) op['$set'] = $set;
    if (Object.keys($unset).length) op['$unset'] = $unset;

    return op;
  }

  private sanitizeTask(task: TaskWithMetadata | null): Task | null {
    if (!task) return null;

    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      __v: _version,
      ...safeTask
    } = task;

    return safeTask as Task;
  }

  private sanitizeStage(
    stage: TaskStageWithMetadata | null,
  ): TaskStageDefinition | null {
    if (!stage) return null;

    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      __v: _version,
      ...safeStage
    } = stage;

    return safeStage as TaskStageDefinition;
  }

  private sanitizeActivity(
    activity: TaskActivityWithMetadata | null,
  ): TaskActivity | null {
    if (!activity) return null;

    const { updatedAt: _updatedAt, __v: _version, ...safeActivity } = activity;
    return safeActivity as TaskActivity;
  }
}
