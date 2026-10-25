import { IsString, MinLength } from 'class-validator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: ADMIN_MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH })
  newPassword: string;
}
