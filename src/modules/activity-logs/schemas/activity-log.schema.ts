import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum LogCategory {
  AUTH = 'auth',
  CLIENT = 'client',
  JOB = 'job',
  INVOICE = 'invoice',
  PAYMENT = 'payment',
  SETTINGS = 'settings',
  ROLE = 'role',
  EMPLOYEE = 'employee',
  TASK = 'task',
  REQUEST = 'request',
  WEBSITE = 'website',
}

@index({ businessId: 1, category: 1, createdAt: -1 })
@index({ businessId: 1, actorId: 1 })
@modelOptions({
  schemaOptions: { collection: 'activity_logs', timestamps: true },
})
export class ActivityLog {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'User', type: Types.ObjectId, required: true })
  actorId: Types.ObjectId;

  @prop({ required: true })
  actorName: string;

  @prop({ required: true })
  actorRole: string;

  @prop({ required: true })
  action: string;

  @prop({ enum: LogCategory, required: true })
  category: LogCategory;

  /** ID of the affected resource */
  @prop({ type: Types.ObjectId })
  resourceId?: Types.ObjectId;

  @prop()
  resourceType?: string;

  /** Snapshot of request metadata for security auditing */
  @prop()
  ipAddress?: string;

  @prop()
  userAgent?: string;

  /**
   * Optional city derived from IP address.
   * Example: "New York", "London"
   */
  @prop({ type: String, sparse: true })
  public city?: string;

  /**
   * Optional country derived from IP address.
   * Example: "United States", "United Kingdom"
   */
  @prop({ type: String, sparse: true })
  public country?: string;

  /**
   * Creation timestamp in the business's local timezone.
   * Useful for displaying timestamps in business-local time without requiring client-side conversion.
   * Example: a business in UTC-5 performing an action at 15:00 UTC will have this stored as 10:00 local.
   */
  @prop({ type: Date, required: true })
  public timestamp!: Date;
}
