import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';

export class InviteAdminDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsEmail({}, { message: ADMIN_MESSAGES.VALIDATION.EMAIL_INVALID })
  email: string;

  @IsOptional()
  @IsString()
  roleId?: string;
}
