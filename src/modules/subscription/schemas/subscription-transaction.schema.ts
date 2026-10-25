import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { SubscriptionPlan } from '../../business/schemas/business.schema';

export enum TransactionType {
  TRIAL_START = 'trial_start',
  SUBSCRIPTION_CREATED = 'subscription_created',
  PAYMENT_SUCCEEDED = 'payment_succeeded',
  PAYMENT_FAILED = 'payment_failed',
  PLAN_UPGRADED = 'plan_upgraded',
  CANCELED = 'canceled',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_RESTORED = 'account_restored',
}

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export type BillingInterval = 'monthly' | 'yearly';

@index({ businessId: 1, createdAt: -1 })
@index({ stripeEventId: 1 }, { unique: true, sparse: true })
@index({ stripeInvoiceId: 1 }, { sparse: true })
@modelOptions({
  schemaOptions: { collection: 'subscription_transactions', timestamps: true },
})
export class SubscriptionTransaction {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  /** Stripe event ID — used for idempotency across webhook retries */
  @prop({ trim: true })
  stripeEventId?: string;

  @prop({ enum: TransactionType, required: true })
  type: TransactionType;

  @prop({ enum: TransactionStatus, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  /** Amount in USD cents (0 for trial events) */
  @prop({ default: 0, min: 0 })
  amountUsd: number;

  @prop({ default: 'usd', lowercase: true })
  currency: string;

  @prop({ enum: SubscriptionPlan, required: true })
  plan: SubscriptionPlan;

  @prop({ enum: ['monthly', 'yearly'], default: 'monthly' })
  billingInterval: BillingInterval;

  @prop({ trim: true })
  stripeSubscriptionId?: string;

  @prop({ trim: true })
  stripeInvoiceId?: string;

  @prop({ trim: true })
  stripePaymentIntentId?: string;

  createdAt: Date;
  updatedAt: Date;
}
