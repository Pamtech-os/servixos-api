import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { REQUESTS_MESSAGES } from 'src/common/constants/messages/requests.messages';
import { RequestStatus } from '../schemas/service-request.schema';

const ACTIONABLE_STATUSES = [
  RequestStatus.ACCEPTED,
  RequestStatus.REJECTED,
  RequestStatus.CANCELLED,
] as const;

export class UpdateRequestDto {
  @IsOptional()
  @IsEnum(ACTIONABLE_STATUSES, {
    message: REQUESTS_MESSAGES.VALIDATION.STATUS_INVALID,
  })
  status?: (typeof ACTIONABLE_STATUSES)[number];

  @IsOptional()
  @IsNumber(
    {},
    {
      message: REQUESTS_MESSAGES.VALIDATION.QUOTED_PRICE_INVALID,
    },
  )
  @Min(0, { message: REQUESTS_MESSAGES.VALIDATION.QUOTED_PRICE_MIN })
  quotedPrice?: number;
}
