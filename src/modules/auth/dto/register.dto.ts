import {
  IsArray,
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsTimeZone,
  Matches,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Match } from 'src/common/validators/match.validator';
import { IsCleanBusinessDescription } from 'src/common/validators/clean-business-description.validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class RegisterDto {
  @IsString({ message: AUTH_MESSAGES.VALIDATION.FIRST_NAME_INVALID })
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.FIRST_NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  firstName: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.LAST_NAME_INVALID })
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.LAST_NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  lastName: string;

  @IsEmail({}, { message: AUTH_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsPhoneNumber(undefined, { message: AUTH_MESSAGES.VALIDATION.PHONE_INVALID })
  phone: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.PASSWORD_INVALID })
  @MinLength(8, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH })
  @Matches(/[A-Z]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_UPPERCASE })
  @Matches(/[0-9]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_NUMBER })
  password: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.CONFIRM_PASSWORD_INVALID })
  @Match('password', { message: AUTH_MESSAGES.VALIDATION.PASSWORDS_MISMATCH })
  confirmPassword: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.PIN_INVALID })
  @Matches(/^\d{4}$/, { message: AUTH_MESSAGES.VALIDATION.PIN_FORMAT })
  pin: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.CONFIRM_PIN_INVALID })
  @Match('pin', { message: AUTH_MESSAGES.VALIDATION.PINS_MISMATCH })
  confirmPin: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.BUSINESS_NAME_INVALID })
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.BUSINESS_NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  businessName: string;

  @IsMongoId({ message: AUTH_MESSAGES.VALIDATION.BUSINESS_CATEGORY_INVALID })
  businessCategory: string;

  @IsString({
    message: AUTH_MESSAGES.VALIDATION.BUSINESS_DESCRIPTION_INVALID,
  })
  @IsNotEmpty({
    message: AUTH_MESSAGES.VALIDATION.BUSINESS_DESCRIPTION_REQUIRED,
  })
  @IsCleanBusinessDescription()
  @Transform(({ value }: { value: string }) => value?.trim())
  businessDescription: string;

  @IsTimeZone({ message: AUTH_MESSAGES.VALIDATION.TIMEZONE_INVALID })
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.TIMEZONE_REQUIRED })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  timezone: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.COLOR_PRIMARY_INVALID })
  @IsOptional()
  colorPrimary?: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.COLOR_SECONDARY_INVALID })
  @IsOptional()
  colorSecondary?: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.FONT_INVALID })
  @IsOptional()
  font?: string;

  @IsArray({ message: AUTH_MESSAGES.VALIDATION.SERVICES_INVALID })
  @IsString({
    each: true,
    message: AUTH_MESSAGES.VALIDATION.SERVICE_ITEM_INVALID,
  })
  @IsOptional()
  services?: string[];
}
