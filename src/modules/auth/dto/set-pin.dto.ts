import { IsString, Matches } from 'class-validator';
import { Match } from 'src/common/validators/match.validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class SetPinDto {
  @IsString({ message: AUTH_MESSAGES.VALIDATION.PIN_INVALID })
  @Matches(/^\d{4}$/, { message: AUTH_MESSAGES.VALIDATION.PIN_FORMAT })
  pin: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.CONFIRM_PIN_INVALID })
  @Match('pin', { message: AUTH_MESSAGES.VALIDATION.PINS_MISMATCH })
  confirmPin: string;
}
