import { IsMongoId } from 'class-validator';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';

export class ProviderIdParamDto {
  @IsMongoId({ message: CLIENT_MESSAGES.VALIDATION.PROVIDER_ID_INVALID })
  providerId: string;
}
