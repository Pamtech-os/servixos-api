import { IsEnum, IsIn } from 'class-validator';
import { SubscriptionPlan } from '../../business/schemas/business.schema';

export class UpgradeDto {
  @IsEnum(SubscriptionPlan, { message: 'Invalid subscription plan' })
  plan: SubscriptionPlan;

  @IsIn(['monthly', 'yearly'], {
    message: 'Billing interval must be monthly or yearly',
  })
  billingInterval: 'monthly' | 'yearly';
}
