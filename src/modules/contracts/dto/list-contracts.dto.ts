import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { CONTRACTS_MESSAGES } from 'src/common/constants/messages/contracts.messages';
import { ContractStatus } from '../schemas/contract.schema';

export class ListContractsDto {
  @IsOptional()
  @IsMongoId({ message: CONTRACTS_MESSAGES.VALIDATION.CLIENT_ID_INVALID })
  clientId?: string;

  @IsOptional()
  @IsEnum(ContractStatus, {
    message: CONTRACTS_MESSAGES.VALIDATION.STATUS_INVALID,
  })
  status?: ContractStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.PAGE_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.PAGE_MIN })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.LIMIT_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.LIMIT_MIN })
  @Max(50, { message: CONTRACTS_MESSAGES.VALIDATION.LIMIT_MAX })
  limit?: number;
}
