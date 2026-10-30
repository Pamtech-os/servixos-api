import { Equals, IsOptional, IsString } from 'class-validator';
import { SUBSCRIPTION_MESSAGES } from 'src/common/constants/messages/subscription.messages';
import { TrialQuoteDto } from './trial-quote.dto';

export class SubscribeDto extends TrialQuoteDto {
  /** Stripe PaymentMethod from a confirmed SetupIntent; required when card-before-access is on. */
  @IsString({
    message: SUBSCRIPTION_MESSAGES.VALIDATION.PAYMENT_METHOD_INVALID,
  })
  @IsOptional()
  paymentMethodId?: string;

  /** Explicit consent to the subscription terms shown in the trial quote. */
  @Equals(true, { message: SUBSCRIPTION_MESSAGES.ERROR.TERMS_NOT_ACCEPTED })
  acceptTerms: boolean;

  /** The `termsVersion` from the trial quote the owner agreed to. */
  @IsString({ message: SUBSCRIPTION_MESSAGES.ERROR.TERMS_OUTDATED })
  termsVersion: string;
}
