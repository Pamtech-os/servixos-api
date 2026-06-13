import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { UserRole } from 'src/modules/users/schemas/user.schema';

export class InviteUserDto {
  @IsString({ message: ADMIN_MESSAGES.VALIDATION.FULL_NAME_INVALID })
  @IsNotEmpty({ message: ADMIN_MESSAGES.VALIDATION.FULL_NAME_REQUIRED })
  fullName: string;

  @IsEmail({}, { message: ADMIN_MESSAGES.VALIDATION.EMAIL_INVALID })
  email: string;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsEnum([UserRole.OWNER, UserRole.EMPLOYEE], {
    message: ADMIN_MESSAGES.VALIDATION.ROLE_INVALID,
  })
  role: UserRole.OWNER | UserRole.EMPLOYEE;
}
