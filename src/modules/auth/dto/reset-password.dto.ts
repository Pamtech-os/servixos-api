import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class ResetPasswordDto {
  @IsString({ message: AUTH_MESSAGES.VALIDATION.OTP_INVALID })
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.OTP_REQUIRED })
  otp: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.PASSWORD_INVALID })
  @MinLength(8, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH })
  @Matches(/[A-Z]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_UPPERCASE })
  @Matches(/[0-9]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_NUMBER })
  newPassword: string;
}
