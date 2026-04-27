import { prop, index, modelOptions, PropType } from '@typegoose/typegoose';
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

class Subscription {
  @prop({ enum: SubscriptionPlan, default: SubscriptionPlan.STARTER })
  plan: SubscriptionPlan;

  @prop({ enum: SubscriptionStatus, default: SubscriptionStatus.TRIALING })
  status: SubscriptionStatus;

  /** Set to now + 1 month on registration; null once a paid plan activates. */
  @prop()
  trialEndsAt?: Date;

  /** End of the current paid billing period (set by Stripe webhook). */
  @prop()
  currentPeriodEnd?: Date;

  /** Set to currentPeriodEnd + 5 days on payment failure; cleared on recovery. */
  @prop()
  gracePeriodEndsAt?: Date;

  /**
   * Feature keys from FEATURE_PLAN_MAP that this business can access.
   * Recomputed via getFeaturesForPlan() whenever `plan` changes.
   * Example: ['clients.export', 'employees.manage', 'ai.insights', ...]
   */
  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  features: string[];
}

export { Subscription };

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

  @prop({ type: () => Subscription, _id: false, default: () => ({}) })
  subscription: Subscription;

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
