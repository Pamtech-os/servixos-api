import { IsMongoId } from 'class-validator';
import { FILES_MESSAGES } from 'src/common/constants/messages/files.messages';

export class FileIdParamDto {
  @IsMongoId({ message: FILES_MESSAGES.VALIDATION.ID_INVALID })
  fileId: string;
}
