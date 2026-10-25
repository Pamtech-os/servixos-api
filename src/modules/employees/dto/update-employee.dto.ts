import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EMPLOYEES_MESSAGES } from 'src/common/constants/messages/employees.messages';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString({ message: EMPLOYEES_MESSAGES.VALIDATION.FULL_NAME_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: EMPLOYEES_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @IsString({ message: EMPLOYEES_MESSAGES.VALIDATION.PHONE_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  phone?: string;

  @IsOptional()
  @IsMongoId({ message: EMPLOYEES_MESSAGES.VALIDATION.ROLE_ID_INVALID })
  roleId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    {},
    { message: EMPLOYEES_MESSAGES.VALIDATION.WEEKLY_TARGET_INVALID },
  )
  @Min(1, { message: EMPLOYEES_MESSAGES.VALIDATION.WEEKLY_TARGET_MIN })
  @Max(168, { message: EMPLOYEES_MESSAGES.VALIDATION.WEEKLY_TARGET_MAX })
  weeklyHoursTarget?: number;

  @IsOptional()
  @IsDateString(
    {},
    { message: EMPLOYEES_MESSAGES.VALIDATION.DATE_JOINED_INVALID },
  )
  dateJoined?: string;
}
