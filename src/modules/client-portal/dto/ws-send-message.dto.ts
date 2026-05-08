import { Transform } from 'class-transformer';
import { IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';

export class WsSendMessageDto {
  @IsMongoId({ message: CLIENT_MESSAGES.VALIDATION.PROVIDER_ID_INVALID })
  @IsNotEmpty()
  providerId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @Transform(({ value }: { value: string }) => value?.trim())
  content: string;
}
