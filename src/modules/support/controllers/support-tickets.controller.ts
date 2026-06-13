import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { SupportTicketsService } from '../services/support-tickets.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';

@Controller('support/tickets')
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Post()
  async createTicket(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTicketDto,
  ) {
    const result = await this.supportTicketsService.createTicket(user, dto);
    if (result instanceof HttpException) throw result;
    return { message: 'Support ticket submitted successfully', data: result };
  }

  @Get()
  async listTickets(@CurrentUser() user: JwtUser, @Query() dto: PaginationDto) {
    const result = await this.supportTicketsService.listTickets(user, dto);
    if (result instanceof HttpException) throw result;
    return { message: 'Tickets retrieved successfully', data: result };
  }

  @Get(':id')
  async getTicket(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const result = await this.supportTicketsService.getTicket(user, id);
    if (result instanceof HttpException) throw result;
    return { message: 'Ticket retrieved successfully', data: result };
  }
}
