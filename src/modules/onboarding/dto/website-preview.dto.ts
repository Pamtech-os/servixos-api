import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ONBOARDING_MESSAGES } from 'src/common/constants/messages/onboarding.messages';

export class WebsitePreviewDto {
  /** Change requests to apply to the next draft, e.g. "make the hero warmer". */
  @IsOptional()
  @IsString({ message: ONBOARDING_MESSAGES.VALIDATION.INSTRUCTIONS_TOO_LONG })
  @MaxLength(1000, {
    message: ONBOARDING_MESSAGES.VALIDATION.INSTRUCTIONS_TOO_LONG,
  })
  instructions?: string;
}
