import { index, modelOptions, prop } from '@typegoose/typegoose';
import { SubscriptionPlan } from '../../business/schemas/business.schema';

class PlanLimits {
  @prop({ required: true }) maxClients: number;
  @prop({ required: true }) maxJobsPerMonth: number;
  @prop({ required: true }) maxInvoicesPerMonth: number;
  @prop({ required: true }) maxEmployees: number;
  @prop({ required: true }) maxAiSuggestions: number;
  @prop({ required: true }) activityLogDays: number;
}

@index({ slug: 1 }, { unique: true })
@index({ displayOrder: 1 })
@modelOptions({ schemaOptions: { collection: 'plans', timestamps: true } })
export class Plan {
  @prop({ enum: SubscriptionPlan, required: true })
  slug: SubscriptionPlan;

  @prop({ required: true, trim: true })
  name: string;

  @prop({ required: true, trim: true })
  description: string;

  /** Monthly price in USD cents (e.g. 2900 = $29.00) */
  @prop({ required: true, min: 0 })
  monthlyPriceUsd: number;

  /** Yearly price in USD cents — billed as one payment */
  @prop({ required: true, min: 0 })
  yearlyPriceUsd: number;

  @prop({ trim: true, default: '' })
  stripePriceIdMonthly: string;

  @prop({ trim: true, default: '' })
  stripePriceIdYearly: string;

  @prop({ trim: true, default: '' })
  stripeProductId: string;

  /** Feature gate keys accessible at this plan level */
  @prop({ type: () => String, default: [] })
  features: string[];

  @prop({ type: () => PlanLimits, _id: false, required: true })
  limits: PlanLimits;

  @prop({ default: 0 })
  displayOrder: number;

  @prop({ default: true })
  isActive: boolean;

  /** Marks the plan as "Most Popular" for UI badge */
  @prop({ default: false })
  isPopular: boolean;
}
