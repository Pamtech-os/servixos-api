import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class ForgotPasswordDto {
  @IsEmail({}, { message: AUTH_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;
}
