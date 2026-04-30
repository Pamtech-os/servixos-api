import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { RequestStatus } from '../schemas/service-request.schema';

const ACTIONABLE_STATUSES = [
  RequestStatus.ACCEPTED,
  RequestStatus.REJECTED,
  RequestStatus.CANCELLED,
] as const;

export class UpdateRequestDto {
  @IsOptional()
  @IsEnum(ACTIONABLE_STATUSES)
  status?: (typeof ACTIONABLE_STATUSES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  quotedPrice?: number;
}
