import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ adminId: 1 })
@index({ tokenHash: 1 }, { unique: true })
@index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
@modelOptions({
  schemaOptions: { collection: 'admin_refresh_tokens', timestamps: true },
})
export class AdminRefreshToken {
  _id: Types.ObjectId;

  @prop({ ref: 'Admin', type: Types.ObjectId, required: true })
  adminId: Types.ObjectId;

  @prop({ required: true })
  tokenHash: string;

  @prop({ required: true })
  expiresAt: Date;

  @prop()
  revokedAt?: Date;
}
