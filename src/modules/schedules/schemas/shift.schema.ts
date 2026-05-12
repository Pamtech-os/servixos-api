import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ businessId: 1, weekStartDate: 1 })
@index({ employeeId: 1, weekStartDate: 1 })
@modelOptions({ schemaOptions: { collection: 'shifts', timestamps: true } })
export class Shift {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Employee', type: Types.ObjectId, required: true })
  employeeId: Types.ObjectId;

  /** ISO date string of the shift date (YYYY-MM-DD) */
  @prop({ required: true })
  shiftDate: Date;

  /** HH:mm format */
  @prop({ required: true })
  startTime: string;

  @prop({ required: true })
  endTime: string;

  @prop()
  notes?: string;

  /** The Monday of the week this shift belongs to (for efficient week queries) */
  @prop({ required: true })
  weekStartDate: Date;

  @prop()
  deletedAt?: Date;
}
