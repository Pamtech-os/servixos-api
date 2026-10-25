import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EMPLOYEES_MESSAGES } from 'src/common/constants/messages/employees.messages';

export class CreateEmployeeDto {
  @IsString({ message: EMPLOYEES_MESSAGES.VALIDATION.FULL_NAME_INVALID })
  @IsNotEmpty({ message: EMPLOYEES_MESSAGES.VALIDATION.FULL_NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  fullName: string;

  @IsNotEmpty({ message: EMPLOYEES_MESSAGES.VALIDATION.EMAIL_REQUIRED })
  @IsEmail({}, { message: EMPLOYEES_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsOptional()
  @IsString({ message: EMPLOYEES_MESSAGES.VALIDATION.PHONE_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  phone?: string;

  @IsNotEmpty({ message: EMPLOYEES_MESSAGES.VALIDATION.ROLE_ID_REQUIRED })
  @IsMongoId({ message: EMPLOYEES_MESSAGES.VALIDATION.ROLE_ID_INVALID })
  roleId: string;

  @Type(() => Number)
  @IsNumber(
    {},
    { message: EMPLOYEES_MESSAGES.VALIDATION.WEEKLY_TARGET_INVALID },
  )
  @Min(1, { message: EMPLOYEES_MESSAGES.VALIDATION.WEEKLY_TARGET_MIN })
  @Max(168, { message: EMPLOYEES_MESSAGES.VALIDATION.WEEKLY_TARGET_MAX })
  weeklyHoursTarget: number;

  @IsOptional()
  @IsDateString(
    {},
    { message: EMPLOYEES_MESSAGES.VALIDATION.DATE_JOINED_INVALID },
  )
  dateJoined?: string;
}
