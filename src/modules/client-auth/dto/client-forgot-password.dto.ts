import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { CLIENT_AUTH_MESSAGES } from 'src/common/constants/messages/client-auth.messages';

export class ClientForgotPasswordDto {
  @IsEmail({}, { message: CLIENT_AUTH_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;
}
