import {
  prop,
  getModelForClass,
  index,
  modelOptions,
  PropType,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum SubscriptionPlan {
  STARTER = 'starter',
  GROWTH = 'growth',
  PRO = 'pro',
}

export enum SubscriptionStatus {
  TRIALING = 'trialing', // 1-month free trial, no payment required
  ACTIVE = 'active', // paid and current
  GRACE_PERIOD = 'grace_period', // payment failed — 5-day window to recover
  LOCKED = 'locked', // trial expired or grace period exhausted
  CANCELED = 'canceled', // explicitly canceled by the business
}

class ColorScheme {
  @prop({ default: '#2563eb' }) primary: string;
  @prop({ default: '#64748b' }) secondary: string;
}

class NotificationPreferences {
  @prop({ default: true }) email: boolean;
  @prop({ default: true }) newClient: boolean;
  @prop({ default: true }) payment: boolean;
}

@index({ ownerId: 1 }, { unique: true })
@index({ subdomain: 1 }, { unique: true, sparse: true })
@modelOptions({ schemaOptions: { collection: 'businesses', timestamps: true } })
export class Business {
  _id: Types.ObjectId;

  @prop({ ref: 'User', type: Types.ObjectId, required: true })
  ownerId: Types.ObjectId;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ lowercase: true, trim: true })
  subdomain?: string;

  @prop({ ref: 'BusinessCategory', type: Types.ObjectId, required: true })
  categoryId: Types.ObjectId;

  @prop({ required: true, trim: true })
  categoryName: string;

  @prop({ trim: true })
  description?: string;

  @prop({ trim: true })
  email?: string;

  @prop({ trim: true })
  phone?: string;

  @prop({ trim: true })
  address?: string;

  @prop({ type: () => ColorScheme, _id: false, default: () => ({}) })
  colors: ColorScheme;

  @prop({ default: 'Inter' })
  font: string;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  services: string[];

  @prop({ enum: SubscriptionPlan, default: SubscriptionPlan.STARTER })
  subscriptionPlan: SubscriptionPlan;

  @prop({ enum: SubscriptionStatus, default: SubscriptionStatus.TRIALING })
  subscriptionStatus: SubscriptionStatus;

  @prop()
  trialEndsAt?: Date; // set to now + 1 month on registration

  @prop()
  currentPeriodEnd?: Date; // end of current paid billing period (from Stripe)

  @prop()
  gracePeriodEndsAt?: Date; // set to currentPeriodEnd + 5 days on payment failure

  @prop({
    type: () => NotificationPreferences,
    _id: false,
    default: () => ({}),
  })
  notifications: NotificationPreferences;

  @prop({ default: 'UTC' })
  timezone: string;

  @prop()
  deletedAt?: Date;
}

export const BusinessModel = getModelForClass(Business);
