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
  @IsString()
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.FIRST_NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.LAST_NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  lastName: string;

  @IsEmail({}, { message: AUTH_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsPhoneNumber(undefined, { message: AUTH_MESSAGES.VALIDATION.PHONE_INVALID })
  phone: string;

  @IsString()
  @MinLength(8, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH })
  @Matches(/[A-Z]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_UPPERCASE })
  @Matches(/[0-9]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_NUMBER })
  password: string;

  @IsString()
  @Match('password', { message: AUTH_MESSAGES.VALIDATION.PASSWORDS_MISMATCH })
  confirmPassword: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: AUTH_MESSAGES.VALIDATION.PIN_FORMAT })
  pin: string;

  @IsString()
  @Match('pin', { message: AUTH_MESSAGES.VALIDATION.PINS_MISMATCH })
  confirmPin: string;

  @IsString()
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.BUSINESS_NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  businessName: string;

  @IsMongoId({ message: AUTH_MESSAGES.VALIDATION.BUSINESS_CATEGORY_INVALID })
  businessCategory: string;

  @IsString()
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

  @IsString()
  @IsOptional()
  colorPrimary?: string;

  @IsString()
  @IsOptional()
  colorSecondary?: string;

  @IsString()
  @IsOptional()
  font?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  services?: string[];
}
