import { IsEmail, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class VerifyEmailDto {
  @IsEmail({}, { message: AUTH_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @Length(6, 6, { message: AUTH_MESSAGES.VALIDATION.OTP_LENGTH })
  otp: string;
}
