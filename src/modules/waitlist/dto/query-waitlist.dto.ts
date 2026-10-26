import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { WAITLIST_MESSAGES } from 'src/common/constants/messages/waitlist.messages';
import { WaitlistPersona } from '../schemas/waitlist-entry.schema';

export class ExportWaitlistDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(WaitlistPersona, {
    message: WAITLIST_MESSAGES.VALIDATION.PERSONA_INVALID,
  })
  persona?: WaitlistPersona;

  @IsOptional()
  @IsDateString({}, { message: WAITLIST_MESSAGES.VALIDATION.DATE_INVALID })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: WAITLIST_MESSAGES.VALIDATION.DATE_INVALID })
  dateTo?: string;
}

export class QueryWaitlistDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(WaitlistPersona, {
    message: WAITLIST_MESSAGES.VALIDATION.PERSONA_INVALID,
  })
  persona?: WaitlistPersona;

  @IsOptional()
  @IsDateString({}, { message: WAITLIST_MESSAGES.VALIDATION.DATE_INVALID })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: WAITLIST_MESSAGES.VALIDATION.DATE_INVALID })
  dateTo?: string;
}
