import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { REQUESTS_MESSAGES } from 'src/common/constants/messages/requests.messages';
import { IsTodayOrFutureDate } from 'src/common/validators/not-past-date.validator';

export class CreateRequestDto {
  @IsString({ message: REQUESTS_MESSAGES.VALIDATION.CLIENT_NAME_INVALID })
  @IsNotEmpty({ message: REQUESTS_MESSAGES.VALIDATION.CLIENT_NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  clientName: string;

  @IsNotEmpty({ message: REQUESTS_MESSAGES.VALIDATION.CLIENT_EMAIL_REQUIRED })
  @IsEmail({}, { message: REQUESTS_MESSAGES.VALIDATION.CLIENT_EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  clientEmail: string;

  @IsOptional()
  @IsString({ message: REQUESTS_MESSAGES.VALIDATION.CLIENT_PHONE_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  clientPhone?: string;

  @IsString({ message: REQUESTS_MESSAGES.VALIDATION.SERVICE_INVALID })
  @IsNotEmpty({ message: REQUESTS_MESSAGES.VALIDATION.SERVICE_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  service: string;

  @IsNotEmpty({ message: REQUESTS_MESSAGES.VALIDATION.REQUESTED_DATE_REQUIRED })
  @IsDateString(
    {},
    { message: REQUESTS_MESSAGES.VALIDATION.REQUESTED_DATE_INVALID },
  )
  @IsTodayOrFutureDate()
  requestedDate: string;

  @IsOptional()
  @IsDateString({}, { message: REQUESTS_MESSAGES.VALIDATION.END_DATE_INVALID })
  requestedEndDate?: string;

  @IsOptional()
  @IsString({ message: REQUESTS_MESSAGES.VALIDATION.MESSAGE_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  message?: string;
}
