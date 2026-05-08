import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { INVOICES_MESSAGES } from 'src/common/constants/messages/invoices.messages';
import { InvoiceStatus } from '../schemas/invoice.schema';
import { InvoiceLineItemDto } from './line-item.dto';

export class UpdateInvoiceDto {
  @IsOptional()
  @IsEnum(InvoiceStatus, {
    message: INVOICES_MESSAGES.VALIDATION.STATUS_INVALID,
  })
  status?: InvoiceStatus;

  @IsOptional()
  @IsDateString({}, { message: INVOICES_MESSAGES.VALIDATION.DUE_DATE_INVALID })
  dueDate?: string;

  @IsOptional()
  @IsArray({ message: INVOICES_MESSAGES.VALIDATION.LINE_ITEMS_REQUIRED })
  @ArrayMinSize(1, {
    message: INVOICES_MESSAGES.VALIDATION.LINE_ITEMS_REQUIRED,
  })
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  lineItems?: InvoiceLineItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: INVOICES_MESSAGES.VALIDATION.TAX_RATE_INVALID })
  @Min(0, { message: INVOICES_MESSAGES.VALIDATION.TAX_RATE_MIN })
  @Max(100, { message: INVOICES_MESSAGES.VALIDATION.TAX_RATE_MAX })
  taxRate?: number;
}
