import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { SubscriptionPlan } from '../../business/schemas/business.schema';

export class SubscribeDto {
  @IsEnum(SubscriptionPlan, { message: 'Invalid subscription plan' })
  plan: SubscriptionPlan;

  @IsIn(['monthly', 'yearly'], {
    message: 'Billing interval must be monthly or yearly',
  })
  billingInterval: 'monthly' | 'yearly';

  /** Optional — if provided, attaches this payment method to the customer before creating the subscription */
  @IsString()
  @IsOptional()
  paymentMethodId?: string;
}
