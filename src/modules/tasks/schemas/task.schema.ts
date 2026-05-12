import { index, modelOptions, prop, PropType } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum TaskStage {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

class Subtask {
  @prop({ required: true })
  _id: Types.ObjectId;

  @prop({ required: true })
  title: string;

  @prop({ default: false })
  completed: boolean;
}

class TaskComment {
  @prop({ required: true })
  _id: Types.ObjectId;

  @prop({ ref: 'User', type: Types.ObjectId, required: true })
  authorId: Types.ObjectId;

  @prop({ required: true })
  authorName: string;

  @prop({ required: true })
  content: string;

  @prop({ default: Date.now })
  createdAt: Date;
}

@index({ businessId: 1, stage: 1 })
@index({ assigneeId: 1, stage: 1 })
@modelOptions({ schemaOptions: { collection: 'tasks', timestamps: true } })
export class Task {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'User', type: Types.ObjectId })
  createdById?: Types.ObjectId;

  @prop({ ref: 'Employee', type: Types.ObjectId, required: true })
  assigneeId: Types.ObjectId;

  @prop({ required: true, trim: true })
  title: string;

  @prop({ trim: true })
  description?: string;

  @prop({ enum: TaskStage, required: true })
  stage: TaskStage;

  @prop({ enum: TaskPriority })
  priority?: TaskPriority;

  @prop()
  dueDate?: Date;

  @prop({ type: () => [Subtask], default: [] }, PropType.ARRAY)
  subtasks: Subtask[];

  @prop({ type: () => [TaskComment], default: [] }, PropType.ARRAY)
  comments: TaskComment[];

  @prop()
  deletedAt?: Date;
}
