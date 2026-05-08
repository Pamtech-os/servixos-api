import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum PaymentMode {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CREDIT_CARD = 'credit_card',
  CHEQUE = 'cheque',
  MOBILE_MONEY = 'mobile_money',
}

export enum PaymentStatus {
  COMPLETED = 'completed',
  PARTIAL = 'partial',
}

@index({ businessId: 1, paymentDate: -1 })
@index({ businessId: 1, invoiceId: 1 })
@modelOptions({ schemaOptions: { collection: 'payments', timestamps: true } })
export class Payment {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Invoice', type: Types.ObjectId })
  invoiceId?: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId })
  clientId?: Types.ObjectId;

  @prop({ trim: true })
  businessName?: string;

  @prop({ required: true })
  paymentDate: Date;

  @prop({ enum: PaymentMode, required: true })
  paymentMode: PaymentMode;

  @prop({ required: true, min: 0 })
  amount: number;

  @prop({ enum: PaymentStatus, default: PaymentStatus.COMPLETED })
  status: PaymentStatus;

  @prop({ trim: true })
  notes?: string;

  @prop({ required: true, default: 'UTC' })
  timezone: string;

  @prop()
  deletedAt?: Date;
}
