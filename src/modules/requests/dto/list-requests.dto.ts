import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { REQUESTS_MESSAGES } from 'src/common/constants/messages/requests.messages';
import { RequestStatus } from '../schemas/service-request.schema';

export class ListRequestsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(RequestStatus, {
    message: REQUESTS_MESSAGES.VALIDATION.STATUS_INVALID,
  })
  status?: RequestStatus;

  @IsOptional()
  @IsString({ message: REQUESTS_MESSAGES.VALIDATION.SEARCH_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  search?: string;
}
