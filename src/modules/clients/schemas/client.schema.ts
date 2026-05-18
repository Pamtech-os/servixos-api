import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ businessId: 1, email: 1 }, { unique: true })
@index({ businessId: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'clients', timestamps: true },
})
export class Client {
  _id: Types.ObjectId;

  @prop({ ref: 'User', type: Types.ObjectId })
  userId?: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ required: true, lowercase: true, trim: true })
  email: string;

  @prop({ trim: true })
  phone?: string;

  /** Running total of unpaid invoice amounts across all pending/partial invoices */
  @prop({ default: 0, min: 0 })
  balance: number;

  @prop()
  deletedAt?: Date;
}
