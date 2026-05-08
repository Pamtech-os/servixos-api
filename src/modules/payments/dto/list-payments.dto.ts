import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { PAYMENTS_MESSAGES } from 'src/common/constants/messages/payments.messages';
import { PaymentMode, PaymentStatus } from '../schemas/payment.schema';

export class ListPaymentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.PAGE_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.PAGE_MIN })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.LIMIT_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.LIMIT_MIN })
  @Max(50, { message: PAYMENTS_MESSAGES.VALIDATION.LIMIT_MAX })
  limit?: number;

  @IsOptional()
  @IsString({ message: PAYMENTS_MESSAGES.VALIDATION.SEARCH_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsEnum(PaymentStatus, {
    message: PAYMENTS_MESSAGES.VALIDATION.STATUS_INVALID,
  })
  status?: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMode, {
    message: PAYMENTS_MESSAGES.VALIDATION.PAYMENT_MODE_INVALID,
  })
  paymentMode?: PaymentMode;

  @IsOptional()
  @IsDateString({}, { message: PAYMENTS_MESSAGES.VALIDATION.DATE_FROM_INVALID })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: PAYMENTS_MESSAGES.VALIDATION.DATE_TO_INVALID })
  dateTo?: string;
}
