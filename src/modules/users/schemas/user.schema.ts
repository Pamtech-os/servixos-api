import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum UserRole {
  OWNER = 'owner',
  EMPLOYEE = 'employee',
}

@index({ email: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'users', timestamps: true } })
export class User {
  @prop({ required: true, trim: true })
  firstName: string;

  @prop({ required: true, trim: true })
  lastName: string;

  @prop({ required: true, lowercase: true, trim: true })
  email: string;

  @prop({ required: true })
  passwordHash: string;

  @prop({ required: true })
  pinHash: string;

  @prop({ trim: true })
  phone?: string;

  @prop({ enum: UserRole, default: UserRole.OWNER })
  userRole: UserRole;

  /** Reference to the Business this user owns or belongs to */
  @prop({ ref: 'Business', type: Types.ObjectId })
  businessId?: Types.ObjectId;

  /** For employee-type users, their associated Employee document */
  @prop({ ref: 'Employee', type: Types.ObjectId })
  employeeId?: Types.ObjectId;

  /** Role (permission set) assigned to this user */
  @prop({ ref: 'Role', type: Types.ObjectId })
  roleId?: Types.ObjectId;

  @prop({ default: false })
  isActive: boolean;

  @prop({ default: false })
  isEmailVerified: boolean;

  @prop()
  lastLoginAt?: Date;

  @prop()
  passwordResetToken?: string;

  @prop()
  passwordResetTokenExpiry?: Date;

  @prop()
  deletedAt?: Date;
}

export const UserModel = getModelForClass(User);
