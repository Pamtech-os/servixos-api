import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ email: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'admins', timestamps: true } })
export class Admin {
  _id: Types.ObjectId;

  @prop({ required: true, trim: true })
  firstName: string;

  @prop({ required: true, trim: true })
  lastName: string;

  @prop({ required: true, lowercase: true, trim: true })
  email: string;

  @prop({ required: true })
  passwordHash: string;

  @prop({ ref: 'AdminRole', type: Types.ObjectId })
  roleId?: Types.ObjectId;

  @prop({ default: true })
  isActive: boolean;

  /** Marks the seeded default admin to prevent accidental deletion */
  @prop({ default: false })
  isDefault: boolean;

  /** Admin must change this temporary password on first login */
  @prop({ default: false })
  mustChangePassword: boolean;

  /** Admin was created via an invitation — OTP required on every login */
  @prop({ default: false })
  isInvited: boolean;

  @prop()
  lastLoginAt?: Date;

  @prop()
  deletedAt?: Date;
}
