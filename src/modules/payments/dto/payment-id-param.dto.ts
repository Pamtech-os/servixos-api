import { IsMongoId } from 'class-validator';
import { PAYMENTS_MESSAGES } from 'src/common/constants/messages/payments.messages';

export class PaymentIdParamDto {
  @IsMongoId({ message: PAYMENTS_MESSAGES.VALIDATION.ID_INVALID })
  id: string;
}
