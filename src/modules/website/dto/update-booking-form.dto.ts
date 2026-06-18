import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { WEBSITE_MESSAGES } from 'src/common/constants/messages/website.messages';
import { BookingFieldKey } from '../schemas/website-config.schema';

export class BookingFormFieldDto {
  @IsEnum(BookingFieldKey, {
    message: WEBSITE_MESSAGES.VALIDATION.BOOKING_FIELD_KEY_INVALID,
  })
  key: BookingFieldKey;

  @IsString({
    message: WEBSITE_MESSAGES.VALIDATION.BOOKING_FIELD_LABEL_INVALID,
  })
  @IsNotEmpty({
    message: WEBSITE_MESSAGES.VALIDATION.BOOKING_FIELD_LABEL_REQUIRED,
  })
  label: string;

  @IsOptional()
  @IsString({
    message: WEBSITE_MESSAGES.VALIDATION.BOOKING_FIELD_PLACEHOLDER_INVALID,
  })
  placeholder?: string;

  @IsBoolean({
    message: WEBSITE_MESSAGES.VALIDATION.BOOKING_FIELD_REQUIRED_INVALID,
  })
  required: boolean;
}

export class UpdateBookingFormDto {
  @IsString({ message: WEBSITE_MESSAGES.VALIDATION.BOOKING_FORM_TITLE_INVALID })
  @IsNotEmpty({
    message: WEBSITE_MESSAGES.VALIDATION.BOOKING_FORM_TITLE_REQUIRED,
  })
  title: string;

  @IsOptional()
  @IsString({
    message: WEBSITE_MESSAGES.VALIDATION.BOOKING_FORM_DESCRIPTION_INVALID,
  })
  description?: string;

  @IsArray({ message: WEBSITE_MESSAGES.VALIDATION.BOOKING_FORM_FIELDS_INVALID })
  @ValidateNested({ each: true })
  @Type(() => BookingFormFieldDto)
  fields: BookingFormFieldDto[];
}
