import { Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { INVOICES_MESSAGES } from 'src/common/constants/messages/invoices.messages';

export class InvoiceLineItemDto {
  @IsString({ message: INVOICES_MESSAGES.VALIDATION.LINE_ITEM_DESC_INVALID })
  @IsNotEmpty({
    message: INVOICES_MESSAGES.VALIDATION.LINE_ITEM_DESC_REQUIRED,
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  description: string;

  @Type(() => Number)
  @IsNumber({}, { message: INVOICES_MESSAGES.VALIDATION.LINE_ITEM_QTY_INVALID })
  @Min(1, { message: INVOICES_MESSAGES.VALIDATION.LINE_ITEM_QTY_MIN })
  quantity: number;

  @Type(() => Number)
  @IsNumber(
    {},
    { message: INVOICES_MESSAGES.VALIDATION.LINE_ITEM_PRICE_INVALID },
  )
  @Min(0, { message: INVOICES_MESSAGES.VALIDATION.LINE_ITEM_PRICE_MIN })
  unitPrice: number;
}
