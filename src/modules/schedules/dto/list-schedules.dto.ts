import { IsDateString, IsMongoId, IsOptional } from 'class-validator';
import { SCHEDULES_MESSAGES } from 'src/common/constants/messages/schedules.messages';

export class ListSchedulesDto {
  @IsOptional()
  @IsDateString(
    {},
    { message: SCHEDULES_MESSAGES.VALIDATION.WEEK_START_DATE_INVALID },
  )
  weekStartDate?: string;

  @IsOptional()
  @IsMongoId({ message: SCHEDULES_MESSAGES.VALIDATION.EMPLOYEE_ID_INVALID })
  employeeId?: string;
}
