import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { AdminSupportService } from '../services/admin-support.service';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AdminJwtPayload } from '../types/admin.types';
import {
  QuerySupportDto,
  AssignTicketDto,
  ReplyTicketDto,
} from '../dto/query-support.dto';

@Public()
@SkipSignature()
@UseGuards(JwtAdminAuthGuard)
@Controller('admin/api/support')
export class AdminSupportController {
  constructor(private readonly adminSupportService: AdminSupportService) {}

  @Get()
  async listTickets(@Query() dto: QuerySupportDto) {
    const result = await this.adminSupportService.listTickets(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.TICKETS_RETRIEVED, data: result };
  }

  @Get('admins')
  async listAdmins() {
    const result = await this.adminSupportService.listAdmins();
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.TEAM_RETRIEVED, data: result };
  }

  @Get(':id')
  async getTicket(@Param('id') id: string) {
    const result = await this.adminSupportService.getTicket(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.TICKET_RETRIEVED, data: result };
  }

  @Patch(':id/assign')
  @HttpCode(HttpStatus.OK)
  async assignTicket(@Param('id') id: string, @Body() dto: AssignTicketDto) {
    const result = await this.adminSupportService.assignTicket(id, dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.TICKET_ASSIGNED, data: result };
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.OK)
  async replyToTicket(
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    const result = await this.adminSupportService.replyToTicket(id, dto, admin);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.TICKET_REPLIED, data: result };
  }

  @Patch(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveTicket(@Param('id') id: string) {
    const result = await this.adminSupportService.resolveTicket(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.TICKET_RESOLVED, data: result };
  }

  @Patch(':id/close')
  @HttpCode(HttpStatus.OK)
  async closeTicket(@Param('id') id: string) {
    const result = await this.adminSupportService.closeTicket(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.TICKET_CLOSED, data: result };
  }
}
