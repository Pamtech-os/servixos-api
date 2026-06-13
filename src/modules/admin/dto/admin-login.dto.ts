import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';

export class AdminLoginDto {
  @IsEmail({}, { message: ADMIN_MESSAGES.VALIDATION.EMAIL_INVALID })
  email: string;

  @IsString({ message: ADMIN_MESSAGES.VALIDATION.PASSWORD_REQUIRED })
  @IsNotEmpty({ message: ADMIN_MESSAGES.VALIDATION.PASSWORD_REQUIRED })
  @MinLength(8, { message: ADMIN_MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH })
  password: string;
}
