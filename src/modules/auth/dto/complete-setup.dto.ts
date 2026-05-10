import { IsString, Matches, MinLength } from 'class-validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { Match } from 'src/common/validators/match.validator';

export class CompleteSetupDto {
  @IsString({ message: AUTH_MESSAGES.VALIDATION.PASSWORD_INVALID })
  @MinLength(8, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH })
  @Matches(/[A-Z]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_UPPERCASE })
  @Matches(/[0-9]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_NUMBER })
  newPassword: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.CONFIRM_PASSWORD_INVALID })
  @Match('newPassword', {
    message: AUTH_MESSAGES.VALIDATION.PASSWORDS_MISMATCH,
  })
  confirmPassword: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.PIN_INVALID })
  @Matches(/^\d{4}$/, { message: AUTH_MESSAGES.VALIDATION.PIN_FORMAT })
  pin: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.CONFIRM_PIN_INVALID })
  @Match('pin', { message: AUTH_MESSAGES.VALIDATION.PINS_MISMATCH })
  confirmPin: string;
}
