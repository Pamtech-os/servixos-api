import { index, modelOptions, prop, PropType } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { TaskStage } from './task.schema';

export enum TaskActivityType {
  TASK_CREATED = 'task_created',
  TASK_UPDATED = 'task_updated',
  TASK_DELETED = 'task_deleted',
  COMMENT_ADDED = 'comment_added',
  SUBTASK_ADDED = 'subtask_added',
  SUBTASK_UPDATED = 'subtask_updated',
  ATTACHMENT_ADDED = 'attachment_added',
}

export class TaskActivityMetadata {
  @prop({ enum: TaskStage })
  stage?: TaskStage;

  @prop()
  assigneeId?: string;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  updatedFields?: string[];

  @prop()
  content?: string;

  @prop()
  subtaskId?: string;

  @prop()
  completed?: boolean;

  @prop()
  filename?: string;
}

@index({ businessId: 1, taskId: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'task_activities', timestamps: true },
})
export class TaskActivity {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Task', type: Types.ObjectId, required: true })
  taskId: Types.ObjectId;

  @prop({ ref: 'User', type: Types.ObjectId, required: true })
  actorId: Types.ObjectId;

  @prop({ required: true })
  actorName: string;

  @prop({ enum: TaskActivityType, required: true })
  type: TaskActivityType;

  @prop({ required: true })
  description: string;

  @prop({ type: () => TaskActivityMetadata })
  metadata?: TaskActivityMetadata;
}
