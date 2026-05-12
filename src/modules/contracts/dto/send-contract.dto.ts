import { IsEmail, IsNotEmpty } from 'class-validator';
import { CONTRACTS_MESSAGES } from 'src/common/constants/messages/contracts.messages';

export class SendContractDto {
  @IsNotEmpty({ message: CONTRACTS_MESSAGES.VALIDATION.CLIENT_EMAIL_REQUIRED })
  @IsEmail({}, { message: CONTRACTS_MESSAGES.VALIDATION.CLIENT_EMAIL_INVALID })
  clientEmail: string;
}
