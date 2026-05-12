import { IsMongoId } from 'class-validator';
import { CONTRACTS_MESSAGES } from 'src/common/constants/messages/contracts.messages';

export class ContractIdParamDto {
  @IsMongoId({ message: CONTRACTS_MESSAGES.VALIDATION.ID_INVALID })
  id: string;
}
