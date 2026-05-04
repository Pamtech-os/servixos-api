import { IsNotEmpty, IsString } from 'class-validator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';

export class DecryptDto {
  @IsString({ message: COMMON_MESSAGES.VALIDATION.STRING_INVALID })
  @IsNotEmpty({ message: COMMON_MESSAGES.VALIDATION.FIELD_REQUIRED })
  data: string;
}
