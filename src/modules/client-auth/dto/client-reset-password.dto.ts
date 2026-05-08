import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { CLIENT_AUTH_MESSAGES } from 'src/common/constants/messages/client-auth.messages';

export class ClientResetPasswordDto {
  @IsString({ message: CLIENT_AUTH_MESSAGES.VALIDATION.OTP_INVALID })
  @IsNotEmpty({ message: CLIENT_AUTH_MESSAGES.VALIDATION.OTP_REQUIRED })
  otp: string;

  @IsString({ message: CLIENT_AUTH_MESSAGES.VALIDATION.PASSWORD_INVALID })
  @MinLength(8, {
    message: CLIENT_AUTH_MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH,
  })
  @Matches(/[A-Z]/, {
    message: CLIENT_AUTH_MESSAGES.VALIDATION.PASSWORD_UPPERCASE,
  })
  @Matches(/[0-9]/, {
    message: CLIENT_AUTH_MESSAGES.VALIDATION.PASSWORD_NUMBER,
  })
  newPassword: string;
}
