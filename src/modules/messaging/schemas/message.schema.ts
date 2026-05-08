import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { MessageSender, MessageStatus } from '../types/messaging.types';

export { MessageSender, MessageStatus } from '../types/messaging.types';

@index({ businessId: 1, clientId: 1, createdAt: -1 })
@index({ conversationId: 1, createdAt: -1 })
@modelOptions({ schemaOptions: { collection: 'messages', timestamps: true } })
export class Message {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ ref: 'Conversation', type: Types.ObjectId, required: true })
  conversationId: Types.ObjectId;

  @prop({ enum: MessageSender, required: true })
  sender: MessageSender;

  @prop({ required: true })
  senderName: string;

  @prop()
  content?: string;

  @prop({ enum: MessageStatus, default: MessageStatus.SENT })
  status: MessageStatus;

  /** Set when the recipient's socket acknowledges receipt */
  @prop()
  deliveredAt?: Date;

  /** Set when the recipient opens the conversation */
  @prop()
  readAt?: Date;

  @prop()
  editedAt?: Date;

  @prop()
  deletedAt?: Date;

  // Attachment fields — populated after a POST /messages/upload-attachment
  @prop()
  attachmentUrl?: string;

  @prop()
  publicId?: string;

  @prop()
  mimeType?: string;

  @prop()
  fileName?: string;

  @prop()
  fileSize?: number;
}
