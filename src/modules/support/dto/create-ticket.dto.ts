import { IsEnum, IsString, MinLength } from 'class-validator';
import {
  TicketCategory,
  TicketPriority,
} from '../schemas/support-ticket.schema';

export class CreateTicketDto {
  @IsString()
  @MinLength(5)
  subject: string;

  @IsString()
  @MinLength(10)
  description: string;

  @IsEnum(TicketPriority)
  priority: TicketPriority;

  @IsEnum(TicketCategory)
  category: TicketCategory;
}
