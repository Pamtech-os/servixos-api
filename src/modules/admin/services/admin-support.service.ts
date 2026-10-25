import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { resolvePagination, buildMeta } from 'src/common/utils/pagination.util';
import { AdminSupportRepository } from '../repositories/admin-support.repository';
import { AdminRepository } from '../repositories/admin.repository';
import {
  QuerySupportDto,
  AssignTicketDto,
  ReplyTicketDto,
} from '../dto/query-support.dto';
import { TicketStatus } from '../../support/schemas/support-ticket.schema';
import type { AdminJwtPayload } from '../types/admin.types';

@Injectable()
export class AdminSupportService {
  private readonly logger = new Logger(AdminSupportService.name);

  constructor(
    private readonly supportRepo: AdminSupportRepository,
    private readonly adminRepo: AdminRepository,
  ) {}

  /** Paginated list of all tickets with stats header. */
  async listTickets(dto: QuerySupportDto) {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const [stats, { data, total }] = await Promise.all([
        this.supportRepo.getStats(),
        this.supportRepo.findAll(
          { search: dto.search, status: dto.status },
          pagination,
        ),
      ]);
      const meta = buildMeta(pagination.page, pagination.limit, total);
      return { stats, tickets: data, meta };
    } catch (error) {
      this.logger.error(
        `listTickets: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** View a single ticket by ID. */
  async getTicket(id: string) {
    try {
      const ticket = await this.supportRepo.findById(id);
      if (!ticket)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.TICKET_NOT_FOUND);
      return ticket;
    } catch (error) {
      if (error instanceof NotFoundException) return error;
      this.logger.error(
        `getTicket: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Assign or unassign a ticket. Passing null/undefined adminId clears the assignee. */
  async assignTicket(id: string, dto: AssignTicketDto) {
    try {
      const ticket = await this.supportRepo.findById(id);
      if (!ticket)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.TICKET_NOT_FOUND);
      if (ticket.status === TicketStatus.CLOSED) {
        return new BadRequestException(
          ADMIN_MESSAGES.ERROR.TICKET_ALREADY_CLOSED,
        );
      }

      if (dto.adminId) {
        const admin = await this.adminRepo.findById(dto.adminId);
        if (!admin)
          return new NotFoundException(ADMIN_MESSAGES.ERROR.USER_NOT_FOUND);
      }

      return await this.supportRepo.assign(id, dto.adminId ?? null);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        return error;
      this.logger.error(
        `assignTicket: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Add an admin reply to a ticket. */
  async replyToTicket(id: string, dto: ReplyTicketDto, admin: AdminJwtPayload) {
    try {
      const ticket = await this.supportRepo.findById(id);
      if (!ticket)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.TICKET_NOT_FOUND);
      if (ticket.status === TicketStatus.CLOSED) {
        return new BadRequestException(
          ADMIN_MESSAGES.ERROR.TICKET_ALREADY_CLOSED,
        );
      }

      const adminRecord = await this.adminRepo.findById(admin.sub);
      const authorName = adminRecord
        ? `${adminRecord.firstName} ${adminRecord.lastName}`
        : 'Admin';

      return await this.supportRepo.addReply(id, {
        content: dto.content,
        authorId: admin.sub,
        authorName,
        authorType: 'admin',
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        return error;
      this.logger.error(
        `replyToTicket: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Resolve a ticket. */
  async resolveTicket(id: string) {
    try {
      const ticket = await this.supportRepo.findById(id);
      if (!ticket)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.TICKET_NOT_FOUND);
      if (ticket.status === TicketStatus.CLOSED) {
        return new BadRequestException(
          ADMIN_MESSAGES.ERROR.TICKET_ALREADY_CLOSED,
        );
      }
      return await this.supportRepo.resolve(id);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        return error;
      this.logger.error(
        `resolveTicket: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Close a ticket. */
  async closeTicket(id: string) {
    try {
      const ticket = await this.supportRepo.findById(id);
      if (!ticket)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.TICKET_NOT_FOUND);
      if (ticket.status === TicketStatus.CLOSED) {
        return new BadRequestException(
          ADMIN_MESSAGES.ERROR.TICKET_ALREADY_CLOSED,
        );
      }
      return await this.supportRepo.close(id);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        return error;
      this.logger.error(
        `closeTicket: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** List all active admins for the assign modal. */
  async listAdmins() {
    try {
      return await this.supportRepo.listAdmins();
    } catch (error) {
      this.logger.error(
        `listAdmins: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }
}
