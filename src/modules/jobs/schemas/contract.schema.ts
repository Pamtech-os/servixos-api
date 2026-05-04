import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum ContractStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  SIGNED = 'signed',
  CANCELLED = 'cancelled',
}

@index({ businessId: 1, jobId: 1 }, { unique: true })
@index({ businessId: 1, clientId: 1, createdAt: -1 })
@modelOptions({ schemaOptions: { collection: 'contracts', timestamps: true } })
export class Contract {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Job', type: Types.ObjectId, required: true })
  jobId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ required: true, trim: true })
  title: string;

  @prop({ required: true })
  html: string;

  @prop({ required: true, trim: true })
  pdfUrl: string;

  @prop({ trim: true })
  cloudinaryPublicId?: string;

  @prop({ enum: ContractStatus, default: ContractStatus.DRAFT })
  status: ContractStatus;

  @prop()
  sentAt?: Date;

  @prop()
  signedAt?: Date;

  @prop({ trim: true })
  signingUrl?: string;

  @prop()
  clientAppDeliveredAt?: Date;

  @prop({ required: true, default: 'UTC' })
  timezone: string;

  @prop()
  deletedAt?: Date;
}
