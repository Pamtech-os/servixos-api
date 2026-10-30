import {
  IsArray,
  IsEnum,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsCleanBusinessDescription } from 'src/common/validators/clean-business-description.validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { SubscriptionPlan } from 'src/modules/business/schemas/business.schema';

export class CreateBusinessDto {
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

  @IsTimeZone({ message: AUTH_MESSAGES.VALIDATION.TIMEZONE_INVALID })
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.TIMEZONE_REQUIRED })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  timezone: string;

  @IsEnum(SubscriptionPlan, { message: 'Invalid subscription plan' })
  @IsOptional()
  plan?: SubscriptionPlan;

  @IsIn(['monthly', 'yearly'], {
    message: 'Billing interval must be monthly or yearly',
  })
  @IsOptional()
  billingInterval?: 'monthly' | 'yearly';
}
