import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { INVOICES_MESSAGES } from 'src/common/constants/messages/invoices.messages';
import { InvoiceStatus } from '../schemas/invoice.schema';

export class ListInvoicesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.PAGE_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.PAGE_MIN })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.LIMIT_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.LIMIT_MIN })
  @Max(50, { message: INVOICES_MESSAGES.VALIDATION.LIMIT_MAX })
  limit?: number;

  @IsOptional()
  @IsString({ message: INVOICES_MESSAGES.VALIDATION.SEARCH_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsMongoId({ message: INVOICES_MESSAGES.VALIDATION.CLIENT_ID_INVALID })
  clientId?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus, {
    message: INVOICES_MESSAGES.VALIDATION.STATUS_INVALID,
  })
  status?: InvoiceStatus;
}
