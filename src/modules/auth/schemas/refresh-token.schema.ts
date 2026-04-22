import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
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

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ required: true })
  tokenHash: string;

  @prop({ required: true })
  expiresAt: Date;

  @prop()
  revokedAt?: Date;
}

export const RefreshTokenModel = getModelForClass(RefreshToken);
