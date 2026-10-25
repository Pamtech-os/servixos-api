import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

@index({ businessId: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'team_messages', timestamps: true },
})
export class TeamMessage {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Employee', type: Types.ObjectId, required: true })
  senderId: Types.ObjectId;

  @prop({ required: true })
  senderName: string;

  @prop({ required: true })
  content: string;
}
