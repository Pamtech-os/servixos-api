import { modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum ReportType {
  USERS = 'users',
  REVENUE = 'revenue',
  BUSINESSES = 'businesses',
  ACTIVITY_LOG = 'activity_log',
  SUBSCRIPTIONS = 'subscriptions',
  AI_USAGE = 'ai_usage',
}

export enum ReportFormat {
  CSV = 'csv',
  EXCEL = 'excel',
}

export enum ReportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

@modelOptions({
  schemaOptions: { collection: 'admin_reports', timestamps: true },
})
export class AdminReport {
  _id: Types.ObjectId;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ required: true, enum: ReportType })
  type: ReportType;

  @prop({ required: true })
  dateFrom: Date;

  @prop({ required: true })
  dateTo: Date;

  @prop({ required: true, enum: ReportFormat })
  format: ReportFormat;

  @prop({ required: true, enum: ReportStatus, default: ReportStatus.PENDING })
  status: ReportStatus;

  @prop()
  rowCount?: number;

  @prop()
  fileSizeBytes?: number;

  @prop()
  fileUrl?: string;

  @prop()
  filePublicId?: string;

  @prop()
  error?: string;

  createdAt: Date;
  updatedAt: Date;
}
