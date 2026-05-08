import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { CLIENT_AUTH_MESSAGES } from 'src/common/constants/messages/client-auth.messages';

export class ClientLoginDto {
  @IsEmail({}, { message: CLIENT_AUTH_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsString({ message: CLIENT_AUTH_MESSAGES.VALIDATION.PASSWORD_INVALID })
  @IsNotEmpty({ message: CLIENT_AUTH_MESSAGES.VALIDATION.PASSWORD_REQUIRED })
  password: string;
}
