import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum InvoiceStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID = 'paid',
}

export class InvoiceLineItem {
  @prop({ required: true, trim: true })
  description: string;

  @prop({ required: true, min: 1 })
  quantity: number;

  @prop({ required: true, min: 0 })
  unitPrice: number;
}

@index({ businessId: 1, status: 1 })
@index({ businessId: 1, clientId: 1 })
@index({ businessId: 1, invoiceNumber: 1 }, { unique: true })
@index({ businessId: 1, jobId: 1 })
@modelOptions({ schemaOptions: { collection: 'invoices', timestamps: true } })
export class Invoice {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ ref: 'Client', type: Types.ObjectId, required: true })
  clientId: Types.ObjectId;

  @prop({ required: true, trim: true })
  invoiceNumber: string;

  @prop({ enum: InvoiceStatus, default: InvoiceStatus.PENDING })
  status: InvoiceStatus;

  @prop({ required: true })
  invoiceDate: Date;

  @prop()
  dueDate?: Date;

  @prop({ type: () => [InvoiceLineItem], _id: false, default: [] })
  lineItems: InvoiceLineItem[];

  @prop({ default: 0, min: 0, max: 100 })
  taxRate: number;

  @prop({ default: 0 })
  totalAmount: number;

  @prop({ default: 0 })
  amountPaid: number;

  @prop({ ref: 'Job', type: Types.ObjectId })
  jobId?: Types.ObjectId;

  @prop()
  pdfUrl?: string;

  @prop()
  sentAt?: Date;

  @prop({ required: true, default: 'UTC' })
  timezone: string;

  @prop()
  deletedAt?: Date;
}
