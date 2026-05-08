import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum JobStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@index({ businessId: 1, status: 1, scheduledDate: 1 })
@index({ businessId: 1, clientId: 1, createdAt: -1 })
/**
 * Enforces one job per source request inside a business only when a request link exists.
 *
 * Example:
 * - Manual jobs (sourceRequestId = null/undefined): unlimited
 * - Accepted request jobs (sourceRequestId = ObjectId): unique per business
 */
@index(
  { businessId: 1, sourceRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceRequestId: { $exists: true, $ne: null },
    },
  },
)
@modelOptions({ schemaOptions: { collection: 'jobs', timestamps: true } })
export class Job {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ ref: 'ServiceRequest', type: Types.ObjectId })
  sourceRequestId?: Types.ObjectId;

  @prop({ required: true, trim: true })
  title: string;

  @prop({ trim: true })
  description?: string;

  @prop({ required: true })
  scheduledDate: Date;

  @prop({ trim: true })
  location?: string;

  @prop({ min: 0 })
  price?: number;

  @prop({ trim: true })
  notes?: string;

  @prop({ enum: JobStatus, default: JobStatus.PENDING })
  status: JobStatus;

  @prop()
  startedAt?: Date;

  @prop()
  completedAt?: Date;

  @prop({ required: true, default: 'UTC' })
  timezone: string;

  @prop()
  deletedAt?: Date;
}
