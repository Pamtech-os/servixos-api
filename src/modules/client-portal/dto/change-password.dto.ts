import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class ChangePasswordDto {
  @IsString({ message: AUTH_MESSAGES.VALIDATION.PASSWORD_INVALID })
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.PASSWORD_INVALID })
  @MinLength(8, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH })
  @Matches(/[A-Z]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_UPPERCASE })
  @Matches(/[0-9]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_NUMBER })
  newPassword: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.CONFIRM_PASSWORD_INVALID })
  @IsNotEmpty({ message: 'Confirm password is required' })
  confirmPassword: string;
}
