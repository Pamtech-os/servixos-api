import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CONTRACTS_MESSAGES } from 'src/common/constants/messages/contracts.messages';

export class CreateContractDto {
  @IsMongoId({ message: CONTRACTS_MESSAGES.VALIDATION.CLIENT_ID_INVALID })
  clientId: string;

  @IsMongoId({ message: CONTRACTS_MESSAGES.VALIDATION.JOB_ID_INVALID })
  jobId: string;

  @IsString({ message: CONTRACTS_MESSAGES.VALIDATION.NAME_INVALID })
  @IsNotEmpty({ message: CONTRACTS_MESSAGES.VALIDATION.NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  name: string;

  @IsNumber({}, { message: CONTRACTS_MESSAGES.VALIDATION.AMOUNT_INVALID })
  @Min(0, { message: CONTRACTS_MESSAGES.VALIDATION.AMOUNT_MIN })
  amount: number;

  @IsOptional()
  @IsDateString(
    {},
    { message: CONTRACTS_MESSAGES.VALIDATION.EXPIRES_AT_INVALID },
  )
  expiresAt?: string;
}
