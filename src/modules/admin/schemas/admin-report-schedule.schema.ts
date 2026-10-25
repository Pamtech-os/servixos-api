import { modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { ReportFormat, ReportType } from './admin-report.schema';

export enum ScheduleFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum ScheduleStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
}

@modelOptions({
  schemaOptions: { collection: 'admin_report_schedules', timestamps: true },
})
export class AdminReportSchedule {
  _id: Types.ObjectId;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ required: true, enum: ReportType })
  type: ReportType;

  @prop({ required: true, enum: ReportFormat })
  format: ReportFormat;

  @prop({ required: true, enum: ScheduleFrequency })
  frequency: ScheduleFrequency;

  @prop({
    required: true,
    enum: ScheduleStatus,
    default: ScheduleStatus.ACTIVE,
  })
  status: ScheduleStatus;

  @prop()
  nextRunAt?: Date;

  @prop()
  lastRunAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}
