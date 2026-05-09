import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ROLES_MESSAGES } from 'src/common/constants/messages/roles.messages';
import { ALL_PERMISSIONS } from '../schemas/role.schema';

export class UpdateRoleDto {
  @IsOptional()
  @IsString({ message: ROLES_MESSAGES.VALIDATION.NAME_INVALID })
  @MaxLength(60, { message: ROLES_MESSAGES.VALIDATION.NAME_TOO_LONG })
  @Transform(({ value }: { value: string }) => value?.trim())
  name?: string;

  @IsOptional()
  @IsArray({ message: ROLES_MESSAGES.VALIDATION.PERMISSIONS_ARRAY })
  @ArrayUnique({ message: ROLES_MESSAGES.VALIDATION.PERMISSION_INVALID })
  @IsIn(ALL_PERMISSIONS, {
    each: true,
    message: ROLES_MESSAGES.VALIDATION.PERMISSION_INVALID,
  })
  permissions?: string[];
}
