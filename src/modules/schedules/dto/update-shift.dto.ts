import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { SCHEDULES_MESSAGES } from 'src/common/constants/messages/schedules.messages';

const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateShiftDto {
  @IsOptional()
  @IsMongoId({ message: SCHEDULES_MESSAGES.VALIDATION.EMPLOYEE_ID_INVALID })
  employeeId?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: SCHEDULES_MESSAGES.VALIDATION.SHIFT_DATE_INVALID },
  )
  shiftDate?: string;

  @IsOptional()
  @IsString({ message: SCHEDULES_MESSAGES.VALIDATION.START_TIME_INVALID })
  @Matches(HH_MM_REGEX, {
    message: SCHEDULES_MESSAGES.VALIDATION.START_TIME_INVALID,
  })
  startTime?: string;

  @IsOptional()
  @IsString({ message: SCHEDULES_MESSAGES.VALIDATION.END_TIME_INVALID })
  @Matches(HH_MM_REGEX, {
    message: SCHEDULES_MESSAGES.VALIDATION.END_TIME_INVALID,
  })
  endTime?: string;

  @IsOptional()
  @IsString({ message: SCHEDULES_MESSAGES.VALIDATION.NOTES_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  notes?: string;
}
