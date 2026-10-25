import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ANALYTICS_MESSAGES } from 'src/common/constants/messages/analytics.messages';

/**
 * Query parameters for the revenue chart endpoint.
 *
 * `months` controls how many full calendar months of revenue history to return,
 * counting backwards from the current month (inclusive).
 *
 * Example: GET /analytics/revenue?months=6
 *   Returns 6 monthly buckets: current month + the 5 preceding months.
 */
export class RevenueQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: ANALYTICS_MESSAGES.VALIDATION.MONTHS_INTEGER })
  @Min(1, { message: ANALYTICS_MESSAGES.VALIDATION.MONTHS_MIN })
  @Max(24, { message: ANALYTICS_MESSAGES.VALIDATION.MONTHS_MAX })
  months?: number;
}
