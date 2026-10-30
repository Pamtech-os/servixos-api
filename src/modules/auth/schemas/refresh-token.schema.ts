import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ userId: 1 })
@index({ tokenHash: 1 }, { unique: true })
@index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
@modelOptions({
  schemaOptions: { collection: 'refresh_tokens', timestamps: true },
})
export class RefreshToken {
  @prop({ ref: 'User', type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  /** Absent on onboarding sessions issued before the business exists. */
  @prop({ ref: 'Business', type: Types.ObjectId })
  businessId?: Types.ObjectId;

  @prop({ required: true })
  tokenHash: string;

  @prop({ required: true })
  expiresAt: Date;

  @prop({ default: false })
  pinVerified: boolean;

  @prop()
  revokedAt?: Date;
}
