import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminSupportService } from 'src/modules/admin/services/admin-support.service';
import { AdminSupportRepository } from 'src/modules/admin/repositories/admin-support.repository';
import { AdminRepository } from 'src/modules/admin/repositories/admin.repository';
import { TicketStatus } from 'src/modules/support/schemas/support-ticket.schema';
import { asMock } from 'test/helpers/mock';

const TICKET_ID = new Types.ObjectId().toString();
const ADMIN_ID = new Types.ObjectId();

const makeTicket = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  ticketNumber: 'T-1001',
  subject: 'Login issue',
  description: 'Cannot log in',
  status: TicketStatus.OPEN,
  priority: 'medium',
  requesterId: new Types.ObjectId(),
  requesterName: 'John Doe',
  replies: [],
  ...overrides,
});

const makeAdminUser = () => ({
  _id: ADMIN_ID,
  firstName: 'Alice',
  lastName: 'Admin',
  email: 'alice@admin.com',
  isActive: true,
});

describe('AdminSupportService', () => {
  let service: AdminSupportService;
  let supportRepo: {
    getStats: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    assign: jest.Mock;
    addReply: jest.Mock;
    resolve: jest.Mock;
    close: jest.Mock;
    listAdmins: jest.Mock;
  };
  let adminRepo: { findById: jest.Mock };

  beforeEach(() => {
    supportRepo = {
      getStats: jest
        .fn()
        .mockResolvedValue({ open: 2, inProgress: 1, resolved: 0, closed: 0 }),
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findById: jest.fn(),
      assign: jest.fn().mockResolvedValue(makeTicket()),
      addReply: jest.fn().mockResolvedValue(makeTicket()),
      resolve: jest
        .fn()
        .mockResolvedValue(makeTicket({ status: TicketStatus.RESOLVED })),
      close: jest
        .fn()
        .mockResolvedValue(makeTicket({ status: TicketStatus.CLOSED })),
      listAdmins: jest.fn().mockResolvedValue([]),
    };
    adminRepo = { findById: jest.fn().mockResolvedValue(makeAdminUser()) };

    service = new AdminSupportService(
      asMock<AdminSupportRepository>(supportRepo),
      asMock<AdminRepository>(adminRepo),
    );
  });

  // ─── listTickets ─────────────────────────────────────────────────────────────

  describe('listTickets', () => {
    it('should return stats, paginated tickets, and meta', async () => {
      // Arrange
      const tickets = [makeTicket()];
      supportRepo.findAll.mockResolvedValue({ data: tickets, total: 1 });

      // Act
      const result = await service.listTickets({ page: 1, limit: 10 });

      // Assert
      expect(result).toMatchObject({ stats: { open: 2 }, tickets });
      expect(result).toHaveProperty('meta.total', 1);
    });

    it('should return InternalServerErrorException on failure', async () => {
      // Arrange
      supportRepo.getStats.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.listTickets({});

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── getTicket ───────────────────────────────────────────────────────────────

  describe('getTicket', () => {
    it('should return ticket when found', async () => {
      // Arrange
      const ticket = makeTicket();
      supportRepo.findById.mockResolvedValue(ticket);

      // Act
      const result = await service.getTicket(TICKET_ID);

      // Assert
      expect(result).toEqual(ticket);
    });

    it('should return NotFoundException when ticket does not exist', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.getTicket('nonexistent');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      supportRepo.findById.mockRejectedValue(new Error('crash'));

      // Act
      const result = await service.getTicket(TICKET_ID);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── assignTicket ────────────────────────────────────────────────────────────

  describe('assignTicket', () => {
    it('should assign an open ticket to an admin', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(
        makeTicket({ status: TicketStatus.OPEN }),
      );
      adminRepo.findById.mockResolvedValue(makeAdminUser());
      const assigned = makeTicket({ assigneeId: ADMIN_ID });
      supportRepo.assign.mockResolvedValue(assigned);

      // Act
      const result = await service.assignTicket(TICKET_ID, {
        adminId: ADMIN_ID.toString(),
      });

      // Assert
      expect(result).toEqual(assigned);
      expect(supportRepo.assign).toHaveBeenCalledWith(
        TICKET_ID,
        ADMIN_ID.toString(),
      );
    });

    it('should clear assignee when adminId is not provided', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(
        makeTicket({ status: TicketStatus.IN_PROGRESS }),
      );
      supportRepo.assign.mockResolvedValue(makeTicket({ assigneeId: null }));

      // Act
      await service.assignTicket(TICKET_ID, {});

      // Assert
      expect(supportRepo.assign).toHaveBeenCalledWith(TICKET_ID, null);
    });

    it('should return BadRequestException when ticket is closed', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(
        makeTicket({ status: TicketStatus.CLOSED }),
      );

      // Act
      const result = await service.assignTicket(TICKET_ID, {
        adminId: ADMIN_ID.toString(),
      });

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
      expect(supportRepo.assign).not.toHaveBeenCalled();
    });

    it('should return NotFoundException when ticket is not found', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.assignTicket('bad-id', {
        adminId: ADMIN_ID.toString(),
      });

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should return NotFoundException when admin does not exist', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(
        makeTicket({ status: TicketStatus.OPEN }),
      );
      adminRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.assignTicket(TICKET_ID, {
        adminId: 'unknown',
      });

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── replyToTicket ──────────────────────────────────────────────────────────

  describe('replyToTicket', () => {
    const ADMIN_PAYLOAD = {
      sub: ADMIN_ID.toString(),
      email: 'alice@admin.com',
      aud: 'admin' as const,
    };

    it('should add an admin reply to an open ticket', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(
        makeTicket({ status: TicketStatus.OPEN }),
      );
      const updated = makeTicket({
        replies: [{ content: 'We are looking into it.', authorType: 'admin' }],
      });
      supportRepo.addReply.mockResolvedValue(updated);

      // Act
      const result = await service.replyToTicket(
        TICKET_ID,
        { content: 'We are looking into it.' },
        ADMIN_PAYLOAD,
      );

      // Assert
      expect(result).toEqual(updated);
      expect(supportRepo.addReply).toHaveBeenCalledWith(
        TICKET_ID,
        expect.objectContaining({
          content: 'We are looking into it.',
          authorType: 'admin',
          authorId: ADMIN_ID.toString(),
        }),
      );
    });

    it('should use "Admin" as authorName when admin record is missing', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(
        makeTicket({ status: TicketStatus.IN_PROGRESS }),
      );
      adminRepo.findById.mockResolvedValue(null);

      // Act
      await service.replyToTicket(
        TICKET_ID,
        { content: 'Noted.' },
        ADMIN_PAYLOAD,
      );

      // Assert
      expect(supportRepo.addReply).toHaveBeenCalledWith(
        TICKET_ID,
        expect.objectContaining({ authorName: 'Admin' }),
      );
    });

    it('should return BadRequestException when ticket is closed', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(
        makeTicket({ status: TicketStatus.CLOSED }),
      );

      // Act
      const result = await service.replyToTicket(
        TICKET_ID,
        { content: 'Too late.' },
        ADMIN_PAYLOAD,
      );

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
    });

    it('should return NotFoundException when ticket is not found', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.replyToTicket(
        TICKET_ID,
        { content: 'reply' },
        ADMIN_PAYLOAD,
      );

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── resolveTicket ──────────────────────────────────────────────────────────

  describe('resolveTicket', () => {
    it('should resolve an open ticket', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(
        makeTicket({ status: TicketStatus.OPEN }),
      );
      const resolved = makeTicket({ status: TicketStatus.RESOLVED });
      supportRepo.resolve.mockResolvedValue(resolved);

      // Act
      const result = await service.resolveTicket(TICKET_ID);

      // Assert
      expect(result).toEqual(resolved);
      expect(supportRepo.resolve).toHaveBeenCalledWith(TICKET_ID);
    });

    it('should return BadRequestException when ticket is already closed', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(
        makeTicket({ status: TicketStatus.CLOSED }),
      );

      // Act
      const result = await service.resolveTicket(TICKET_ID);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
      expect(supportRepo.resolve).not.toHaveBeenCalled();
    });

    it('should return NotFoundException when ticket is not found', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.resolveTicket('unknown-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── closeTicket ────────────────────────────────────────────────────────────

  describe('closeTicket', () => {
    it('should close a resolved ticket', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(
        makeTicket({ status: TicketStatus.RESOLVED }),
      );
      const closed = makeTicket({ status: TicketStatus.CLOSED });
      supportRepo.close.mockResolvedValue(closed);

      // Act
      const result = await service.closeTicket(TICKET_ID);

      // Assert
      expect(result).toEqual(closed);
      expect(supportRepo.close).toHaveBeenCalledWith(TICKET_ID);
    });

    it('should return BadRequestException when ticket is already closed', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(
        makeTicket({ status: TicketStatus.CLOSED }),
      );

      // Act
      const result = await service.closeTicket(TICKET_ID);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
      expect(supportRepo.close).not.toHaveBeenCalled();
    });

    it('should return NotFoundException when ticket does not exist', async () => {
      // Arrange
      supportRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.closeTicket('unknown-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── listAdmins ─────────────────────────────────────────────────────────────

  describe('listAdmins', () => {
    it('should return admin list for assign modal', async () => {
      // Arrange
      const admins = [
        { _id: ADMIN_ID, firstName: 'Alice', email: 'alice@admin.com' },
      ];
      supportRepo.listAdmins.mockResolvedValue(admins);

      // Act
      const result = await service.listAdmins();

      // Assert
      expect(result).toEqual(admins);
    });

    it('should return InternalServerErrorException on failure', async () => {
      // Arrange
      supportRepo.listAdmins.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.listAdmins();

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });
});
