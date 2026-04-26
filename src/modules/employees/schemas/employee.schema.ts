import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ businessId: 1, email: 1 }, { unique: true })
@index({ businessId: 1, fullName: 'text' })
@modelOptions({ schemaOptions: { collection: 'employees', timestamps: true } })
export class Employee {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  /** Linked user account (set after employee accepts invite) */
  @prop({ ref: 'User', type: Types.ObjectId })
  userId?: Types.ObjectId;

  @prop({ ref: 'Role', type: Types.ObjectId, required: true })
  roleId: Types.ObjectId;

  @prop({ required: true, trim: true })
  fullName: string;

  @prop({ required: true, lowercase: true, trim: true })
  email: string;

  @prop({ trim: true })
  phone?: string;

  @prop({ default: 40 })
  weeklyHoursTarget: number;

  @prop()
  dateJoined?: Date;

  @prop()
  deletedAt?: Date;
}
