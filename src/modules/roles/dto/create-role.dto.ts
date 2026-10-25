import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { ALL_PERMISSIONS } from 'src/common/constants/permissions.constants';
import { ROLES_MESSAGES } from 'src/common/constants/messages/roles.messages';

export class CreateRoleDto {
  @IsString({ message: ROLES_MESSAGES.VALIDATION.NAME_INVALID })
  @IsNotEmpty({ message: ROLES_MESSAGES.VALIDATION.NAME_REQUIRED })
  @MaxLength(60, { message: ROLES_MESSAGES.VALIDATION.NAME_TOO_LONG })
  @Transform(({ value }: { value: string }) => value?.trim())
  name: string;

  @IsArray({ message: ROLES_MESSAGES.VALIDATION.PERMISSIONS_ARRAY })
  @ArrayUnique({ message: ROLES_MESSAGES.VALIDATION.PERMISSION_INVALID })
  @IsIn(ALL_PERMISSIONS, {
    each: true,
    message: ROLES_MESSAGES.VALIDATION.PERMISSION_INVALID,
  })
  permissions: string[];
}
