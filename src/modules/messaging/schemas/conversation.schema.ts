import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { MessageSender } from '../messaging.types';

@index({ businessId: 1, clientId: 1 }, { unique: true })
@index({ businessId: 1, updatedAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'conversations', timestamps: true },
})
export class Conversation {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ default: '' })
  lastMessageContent: string;

  @prop()
  lastMessageAt?: Date;

  @prop({ enum: MessageSender, default: MessageSender.BUSINESS })
  lastMessageSender: MessageSender;

  /** Unread count for the business side (messages sent by client, not yet read) */
  @prop({ default: 0 })
  businessUnreadCount: number;

  /** Unread count for the client side (messages sent by business, not yet read) */
  @prop({ default: 0 })
  clientUnreadCount: number;

  /** True while either participant's socket is in this room */
  @prop({ default: false })
  isActive: boolean;
}
