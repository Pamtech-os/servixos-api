import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ businessId: 1, jobId: 1 }, { unique: true })
@index({ businessId: 1, rating: 1 })
@index({ businessId: 1, clientId: 1 })
@modelOptions({ schemaOptions: { collection: 'reviews', timestamps: true } })
export class Review {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ ref: 'Job', type: Types.ObjectId, required: true })
  jobId: Types.ObjectId;

  @prop({ min: 1, max: 5, required: true })
  rating: number;

  @prop({ trim: true, maxlength: 1000 })
  comment?: string;
}
