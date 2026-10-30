import { IsMongoId, IsOptional, IsTimeZone } from 'class-validator';
import { ONBOARDING_MESSAGES } from 'src/common/constants/messages/onboarding.messages';

export class ApproveSetupDto {
  /** Overrides the category matched from the AI concept's industry. */
  @IsOptional()
  @IsMongoId({ message: ONBOARDING_MESSAGES.VALIDATION.CATEGORY_INVALID })
  businessCategory?: string;

  /** Defaults to the launch country's primary timezone. */
  @IsOptional()
  @IsTimeZone({ message: ONBOARDING_MESSAGES.VALIDATION.TIMEZONE_INVALID })
  timezone?: string;
}
