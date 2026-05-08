import { IsMongoId, IsNotEmpty } from 'class-validator';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';

export class WsConversationRoomDto {
  @IsMongoId({ message: CLIENT_MESSAGES.VALIDATION.PROVIDER_ID_INVALID })
  @IsNotEmpty({ message: CLIENT_MESSAGES.VALIDATION.PROVIDER_ID_INVALID })
  providerId: string;
}
