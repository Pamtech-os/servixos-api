import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum ClockStatus {
  CLOCKED_IN = 'clocked_in',
  CLOCKED_OUT = 'clocked_out',
  ON_BREAK = 'on_break',
}

@index({ businessId: 1, employeeId: 1, clockInAt: -1 })
@index(
  { businessId: 1, employeeId: 1, clockOutAt: 1, deletedAt: 1 },
  {
    unique: true,
    partialFilterExpression: { clockOutAt: null, deletedAt: null },
  },
)
@modelOptions({
  schemaOptions: { collection: 'clock_records', timestamps: true },
})
export class ClockRecord {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Employee', type: Types.ObjectId, required: true })
  employeeId: Types.ObjectId;

  @prop({ required: true })
  clockInAt: Date;

  @prop()
  clockOutAt?: Date;

  @prop({ default: 0 })
  breakMinutes: number;

  @prop()
  breakStartedAt?: Date;

  @prop({ enum: ClockStatus, default: ClockStatus.CLOCKED_IN })
  status: ClockStatus;

  @prop()
  totalHours?: number;

  /** IANA timezone used when writing local wall-clock timestamps */
  @prop({ required: true, default: 'UTC' })
  timezone: string;

  @prop()
  deletedAt?: Date;
}
