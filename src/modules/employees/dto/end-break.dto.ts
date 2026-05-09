import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, Max, Min } from 'class-validator';
import { TIME_TRACKING_MESSAGES } from 'src/common/constants/messages/time-tracking.messages';
import { ClockActionDto } from './clock-action.dto';

export class EndBreakDto extends ClockActionDto {
  @IsNotEmpty({
    message: TIME_TRACKING_MESSAGES.VALIDATION.BREAK_DURATION_REQUIRED,
  })
  @Type(() => Number)
  @IsNumber(
    {},
    { message: TIME_TRACKING_MESSAGES.VALIDATION.BREAK_DURATION_INVALID },
  )
  @Min(1, { message: TIME_TRACKING_MESSAGES.VALIDATION.BREAK_DURATION_MIN })
  @Max(480, { message: TIME_TRACKING_MESSAGES.VALIDATION.BREAK_DURATION_MAX })
  breakDurationMinutes: number;
}
