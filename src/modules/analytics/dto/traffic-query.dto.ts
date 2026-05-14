import { Transform } from 'class-transformer';
import { IsDateString, IsOptional } from 'class-validator';
import { ANALYTICS_MESSAGES } from 'src/common/constants/messages/analytics.messages';

/**
 * Query parameters for the traffic analytics endpoint.
 *
 * Both dates are ISO 8601 date strings (YYYY-MM-DD). Defaults are applied in
 * the service layer: dateFrom defaults to 7 days ago, dateTo to today.
 *
 * Example: GET /analytics/traffic?dateFrom=2026-04-01&dateTo=2026-04-30
 */
export class TrafficQueryDto {
  @IsOptional()
  @IsDateString(
    {},
    { message: ANALYTICS_MESSAGES.VALIDATION.DATE_FROM_INVALID },
  )
  @Transform(({ value }: { value: string }) => value?.trim())
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: ANALYTICS_MESSAGES.VALIDATION.DATE_TO_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  dateTo?: string;
}
