import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum RequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@index({ businessId: 1, status: 1 })
@index({ businessId: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'service_requests', timestamps: true },
})
export class ServiceRequest {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  /** Created when request is accepted and converted to a client record */
  @prop({ ref: 'Client', type: Types.ObjectId })
  clientId?: Types.ObjectId;

  @prop({ required: true, trim: true })
  clientName: string;

  @prop({ required: true, lowercase: true, trim: true })
  clientEmail: string;

  @prop({ trim: true })
  clientPhone?: string;

  @prop({ required: true, trim: true })
  service: string;

  @prop({ required: true })
  requestedDate: Date;

  @prop()
  requestedEndDate?: Date;

  @prop()
  message?: string;

  @prop({ enum: RequestStatus, default: RequestStatus.PENDING })
  status: RequestStatus;

  @prop({ min: 0 })
  quotedPrice?: number;

  @prop()
  startDate?: Date;

  @prop()
  endDate?: Date;

  @prop()
  actionedAt?: Date;

  @prop()
  actionedBy?: Types.ObjectId;

  @prop()
  deletedAt?: Date;
}
