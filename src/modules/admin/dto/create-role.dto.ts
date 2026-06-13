import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ALL_ADMIN_PERMISSIONS } from 'src/common/constants/admin-permissions.constants';
import type { AdminPermission } from 'src/common/constants/admin-permissions.constants';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';

export class CreateRoleDto {
  @IsString()
  @MinLength(2, { message: ADMIN_MESSAGES.VALIDATION.ROLE_NAME_MIN_LENGTH })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsIn(ALL_ADMIN_PERMISSIONS, {
    each: true,
    message: ADMIN_MESSAGES.VALIDATION.PERMISSION_INVALID,
  })
  permissions: AdminPermission[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: ADMIN_MESSAGES.VALIDATION.ROLE_NAME_MIN_LENGTH })
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsIn(ALL_ADMIN_PERMISSIONS, {
    each: true,
    message: ADMIN_MESSAGES.VALIDATION.PERMISSION_INVALID,
  })
  permissions?: AdminPermission[];
}

export class AssignRoleDto {
  @IsString()
  adminId: string;

  @IsString()
  roleId: string;
}
