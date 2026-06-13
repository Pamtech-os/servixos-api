import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { resolvePagination, buildMeta } from 'src/common/utils/pagination.util';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { SupportTicketsRepository } from '../repositories/support-tickets.repository';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';

const SUPPORT_MESSAGES = {
  TICKET_CREATED: 'Support ticket submitted successfully',
  TICKETS_RETRIEVED: 'Tickets retrieved successfully',
  TICKET_RETRIEVED: 'Ticket retrieved successfully',
  TICKET_NOT_FOUND: 'Ticket not found',
};

@Injectable()
export class SupportTicketsService {
  private readonly logger = new Logger(SupportTicketsService.name);

  constructor(
    private readonly ticketsRepo: SupportTicketsRepository,
    private readonly usersRepo: UsersRepository,
    private readonly businessRepo: BusinessRepository,
  ) {}

  /** Create a new support ticket for the requester's business. */
  async createTicket(user: JwtUser, dto: CreateTicketDto) {
    try {
      const [requester, business] = await Promise.all([
        this.usersRepo.findById(user.sub),
        this.businessRepo.findById(user.businessId),
      ]);

      if (!requester || !business) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.INTERNAL);
      }

      const ticket = await this.ticketsRepo.create({
        subject: dto.subject,
        description: dto.description,
        priority: dto.priority,
        category: dto.category,
        requesterId: user.sub,
        requesterName: `${requester.firstName} ${requester.lastName}`,
        requesterEmail: requester.email,
        businessId: user.businessId,
        businessName: business.name,
      });

      return ticket;
    } catch (error) {
      if (error instanceof NotFoundException) return error;
      this.logger.error(
        `createTicket: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** List all tickets for the authenticated business. */
  async listTickets(user: JwtUser, dto: PaginationDto) {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const { data, total } = await this.ticketsRepo.findByBusiness(
        user.businessId,
        pagination,
      );
      const meta = buildMeta(pagination.page, pagination.limit, total);
      return { tickets: data, meta };
    } catch (error) {
      this.logger.error(
        `listTickets: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** View a single ticket that belongs to the authenticated business. */
  async getTicket(user: JwtUser, id: string) {
    try {
      const ticket = await this.ticketsRepo.findByIdAndBusiness(
        id,
        user.businessId,
      );
      if (!ticket)
        return new NotFoundException(SUPPORT_MESSAGES.TICKET_NOT_FOUND);
      return ticket;
    } catch (error) {
      if (error instanceof NotFoundException) return error;
      this.logger.error(
        `getTicket: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }
}
