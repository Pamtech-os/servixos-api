import { prop, index, modelOptions, PropType } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TicketCategory {
  TECHNICAL = 'Technical',
  ACCOUNT = 'Account',
  BILLING = 'Billing',
  GENERAL = 'General',
}

export class TicketReply {
  @prop({ required: true })
  content: string;

  @prop({ type: Types.ObjectId, required: true })
  authorId: Types.ObjectId;

  @prop({ required: true })
  authorName: string;

  @prop({ enum: ['admin', 'user'], required: true })
  authorType: 'admin' | 'user';

  @prop({ default: () => new Date() })
  createdAt: Date;
}

@index({ businessId: 1, status: 1, createdAt: -1 })
@index({ assigneeId: 1, status: 1 })
@index({ createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'support_tickets', timestamps: true },
})
export class SupportTicket {
  _id: Types.ObjectId;

  /** Sequential ticket number, e.g. T-1001 */
  @prop({ required: true, unique: true })
  ticketNumber: string;

  @prop({ required: true, trim: true })
  subject: string;

  @prop({ required: true })
  description: string;

  @prop({ enum: TicketPriority, required: true })
  priority: TicketPriority;

  @prop({ enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @prop({ enum: TicketCategory, required: true })
  category: TicketCategory;

  /** Business user who created the ticket */
  @prop({ ref: 'User', type: Types.ObjectId, required: true })
  requesterId: Types.ObjectId;

  @prop({ required: true })
  requesterName: string;

  @prop({ required: true, lowercase: true })
  requesterEmail: string;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ required: true })
  businessName: string;

  /** Admin assigned to handle this ticket */
  @prop({ ref: 'Admin', type: Types.ObjectId })
  assigneeId?: Types.ObjectId;

  @prop()
  assigneeName?: string;

  @prop({ type: () => TicketReply, default: [] }, PropType.ARRAY)
  replies: TicketReply[];

  @prop()
  resolvedAt?: Date;

  @prop()
  closedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}
