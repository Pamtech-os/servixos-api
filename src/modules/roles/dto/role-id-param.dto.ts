import { IsMongoId } from 'class-validator';
import { ROLES_MESSAGES } from 'src/common/constants/messages/roles.messages';

export class RoleIdParamDto {
  @IsMongoId({ message: ROLES_MESSAGES.VALIDATION.ID_INVALID })
  id: string;
}
