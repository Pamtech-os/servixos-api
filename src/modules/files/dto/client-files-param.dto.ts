import { IsMongoId } from 'class-validator';
import { FILES_MESSAGES } from 'src/common/constants/messages/files.messages';

export class ClientFilesParamDto {
  @IsMongoId({ message: FILES_MESSAGES.VALIDATION.CLIENT_ID_INVALID })
  clientId: string;
}
