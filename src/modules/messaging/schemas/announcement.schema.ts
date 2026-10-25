import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ businessId: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'announcements', timestamps: true },
})
export class Announcement {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Employee', type: Types.ObjectId, required: true })
  authorId: Types.ObjectId;

  @prop({ required: true })
  authorName: string;

  @prop({ required: true, trim: true })
  title: string;

  @prop({ required: true })
  description: string;
}
