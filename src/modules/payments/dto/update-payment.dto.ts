import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PAYMENTS_MESSAGES } from 'src/common/constants/messages/payments.messages';
import { PaymentMode, PaymentStatus } from '../schemas/payment.schema';

export class UpdatePaymentDto {
  @IsOptional()
  @IsMongoId({ message: PAYMENTS_MESSAGES.VALIDATION.INVOICE_ID_INVALID })
  invoiceId?: string;

  @IsOptional()
  @IsMongoId({ message: PAYMENTS_MESSAGES.VALIDATION.CLIENT_ID_INVALID })
  clientId?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: PAYMENTS_MESSAGES.VALIDATION.PAYMENT_DATE_INVALID },
  )
  paymentDate?: string;

  @IsOptional()
  @IsEnum(PaymentMode, {
    message: PAYMENTS_MESSAGES.VALIDATION.PAYMENT_MODE_INVALID,
  })
  paymentMode?: PaymentMode;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: PAYMENTS_MESSAGES.VALIDATION.AMOUNT_INVALID })
  @Min(0.01, { message: PAYMENTS_MESSAGES.VALIDATION.AMOUNT_MIN })
  amount?: number;

  @IsOptional()
  @IsEnum(PaymentStatus, {
    message: PAYMENTS_MESSAGES.VALIDATION.STATUS_INVALID,
  })
  status?: PaymentStatus;

  @IsOptional()
  @IsString({ message: PAYMENTS_MESSAGES.VALIDATION.NOTES_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  notes?: string;
}
