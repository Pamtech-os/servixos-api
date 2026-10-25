import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { TaskStage } from './task.schema';

@index({ businessId: 1, key: 1 }, { unique: true })
@index({ businessId: 1, order: 1 })
@modelOptions({
  schemaOptions: { collection: 'task_stages', timestamps: true },
})
export class TaskStageDefinition {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ enum: TaskStage, required: true })
  key: TaskStage;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ required: true, default: 0 })
  order: number;

  @prop({ default: true })
  isSystem: boolean;

  @prop()
  deletedAt?: Date;
}
