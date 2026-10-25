import { IsNotEmpty } from 'class-validator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';

export class EncryptDto {
  @IsNotEmpty({ message: COMMON_MESSAGES.VALIDATION.FIELD_REQUIRED })
  data: unknown;
}
