import { IsMongoId } from 'class-validator';
import { INVOICES_MESSAGES } from 'src/common/constants/messages/invoices.messages';

export class InvoiceIdParamDto {
  @IsMongoId({ message: INVOICES_MESSAGES.VALIDATION.ID_INVALID })
  id: string;
}
