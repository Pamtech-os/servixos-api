import { IsEnum, IsIn } from 'class-validator';
import { SUBSCRIPTION_MESSAGES } from 'src/common/constants/messages/subscription.messages';
import { SubscriptionPlan } from '../../business/schemas/business.schema';

export class TrialQuoteDto {
  @IsEnum(SubscriptionPlan, {
    message: SUBSCRIPTION_MESSAGES.VALIDATION.PLAN_INVALID,
  })
  plan: SubscriptionPlan;

  @IsIn(['monthly', 'yearly'], {
    message: SUBSCRIPTION_MESSAGES.VALIDATION.INTERVAL_INVALID,
  })
  billingInterval: 'monthly' | 'yearly';
}
