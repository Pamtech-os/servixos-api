import { IsString, Matches } from 'class-validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class VerifyPinDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: AUTH_MESSAGES.VALIDATION.PIN_FORMAT })
  pin: string;
}
