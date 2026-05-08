import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { INVOICES_MESSAGES } from 'src/common/constants/messages/invoices.messages';
import { InvoiceLineItemDto } from './line-item.dto';

export class CreateInvoiceDto {
  @IsMongoId({ message: INVOICES_MESSAGES.VALIDATION.CLIENT_ID_INVALID })
  clientId: string;

  @IsString({ message: INVOICES_MESSAGES.VALIDATION.NUMBER_INVALID })
  @IsNotEmpty({ message: INVOICES_MESSAGES.VALIDATION.NUMBER_REQUIRED })
  invoiceNumber: string;

  @IsDateString(
    {},
    { message: INVOICES_MESSAGES.VALIDATION.INVOICE_DATE_INVALID },
  )
  invoiceDate: string;

  @IsOptional()
  @IsDateString({}, { message: INVOICES_MESSAGES.VALIDATION.DUE_DATE_INVALID })
  dueDate?: string;

  @IsArray({ message: INVOICES_MESSAGES.VALIDATION.LINE_ITEMS_REQUIRED })
  @ArrayMinSize(1, {
    message: INVOICES_MESSAGES.VALIDATION.LINE_ITEMS_REQUIRED,
  })
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  lineItems: InvoiceLineItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: INVOICES_MESSAGES.VALIDATION.TAX_RATE_INVALID })
  @Min(0, { message: INVOICES_MESSAGES.VALIDATION.TAX_RATE_MIN })
  @Max(100, { message: INVOICES_MESSAGES.VALIDATION.TAX_RATE_MAX })
  taxRate?: number;

  @IsOptional()
  @IsMongoId({ message: INVOICES_MESSAGES.VALIDATION.JOB_ID_INVALID })
  jobId?: string;
}
