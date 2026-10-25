import { IsMongoId, IsNotEmpty } from 'class-validator';
import { TIME_TRACKING_MESSAGES } from 'src/common/constants/messages/time-tracking.messages';

export class ClockActionDto {
  @IsNotEmpty({
    message: TIME_TRACKING_MESSAGES.VALIDATION.EMPLOYEE_ID_REQUIRED,
  })
  @IsMongoId({ message: TIME_TRACKING_MESSAGES.VALIDATION.EMPLOYEE_ID_INVALID })
  employeeId: string;
}
