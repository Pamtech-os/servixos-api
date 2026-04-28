import {
  IsArray,
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsCleanBusinessDescription } from 'src/common/validators/clean-business-description.validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class CreateBusinessDto {
  @IsEmail({}, { message: AUTH_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

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

  @IsTimeZone({ message: AUTH_MESSAGES.VALIDATION.TIMEZONE_INVALID })
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.TIMEZONE_REQUIRED })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  timezone: string;
}
