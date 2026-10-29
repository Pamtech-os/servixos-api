import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Match } from 'src/common/validators/match.validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { SupportedCountry } from 'src/common/constants/countries.constants';
import { IsSupportedCountryPhone } from 'src/common/validators/supported-country-phone.validator';

export class CreateAccountDto {
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

  @IsEnum(SupportedCountry, {
    message: AUTH_MESSAGES.VALIDATION.COUNTRY_UNSUPPORTED,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  country: SupportedCountry;

  @IsSupportedCountryPhone({
    message: AUTH_MESSAGES.VALIDATION.PHONE_COUNTRY_UNSUPPORTED,
  })
  phone: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.PASSWORD_INVALID })
  @MinLength(8, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH })
  @Matches(/[A-Z]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_UPPERCASE })
  @Matches(/[0-9]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_NUMBER })
  password: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.CONFIRM_PASSWORD_INVALID })
  @Match('password', { message: AUTH_MESSAGES.VALIDATION.PASSWORDS_MISMATCH })
  confirmPassword: string;

  @IsOptional()
  @IsString({ message: AUTH_MESSAGES.VALIDATION.REGISTRATION_NUMBER_INVALID })
  @MaxLength(30, {
    message: AUTH_MESSAGES.VALIDATION.REGISTRATION_NUMBER_INVALID,
  })
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: AUTH_MESSAGES.VALIDATION.REGISTRATION_NUMBER_INVALID,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') || undefined : value,
  )
  businessRegistrationNumber?: string;
}
