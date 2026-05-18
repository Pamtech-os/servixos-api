import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { CONTRACTS_MESSAGES } from 'src/common/constants/messages/contracts.messages';
import { ContractStatus } from '../schemas/contract.schema';

export class UpdateContractDto {
  @IsOptional()
  @IsEnum(ContractStatus, {
    message: CONTRACTS_MESSAGES.VALIDATION.STATUS_INVALID,
  })
  status?: ContractStatus;

  @IsOptional()
  @IsDateString(
    {},
    { message: CONTRACTS_MESSAGES.VALIDATION.SIGNED_AT_INVALID },
  )
  signedAt?: string;

  @IsOptional()
  @IsString({ message: CONTRACTS_MESSAGES.VALIDATION.HTML_INVALID })
  html?: string;
}
