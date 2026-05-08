import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';

export class SignContractDto {
  @IsString()
  @IsNotEmpty({ message: CLIENT_MESSAGES.CONTRACT.ERROR.SIGNATURE_REQUIRED })
  @Matches(/^data:image\/(png|jpeg);base64,/, {
    message: CLIENT_MESSAGES.VALIDATION.SIGNATURE_INVALID,
  })
  signatureData: string;
}
