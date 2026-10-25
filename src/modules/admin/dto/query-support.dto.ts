import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { TicketStatus } from 'src/modules/support/schemas/support-ticket.schema';

export class QuerySupportDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;
}

export class AssignTicketDto {
  @IsOptional()
  @IsString()
  adminId?: string;
}

export class ReplyTicketDto {
  @IsString()
  content: string;
}
