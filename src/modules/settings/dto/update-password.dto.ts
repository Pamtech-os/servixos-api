import { IsString, Matches, MinLength } from 'class-validator';
import { Match } from 'src/common/validators/match.validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class UpdatePasswordDto {
  @IsString({ message: AUTH_MESSAGES.VALIDATION.PASSWORD_INVALID })
  currentPassword: string;

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
}
