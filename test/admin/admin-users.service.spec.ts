import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import * as hashUtil from 'src/common/utils/hash.util';
import { AdminUsersService } from 'src/modules/admin/services/admin-users.service';
import { UserRole } from 'src/modules/users/schemas/user.schema';
import { AdminUsersRepository } from 'src/modules/admin/repositories/admin-users.repository';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { asMock } from 'test/helpers/mock';

const USER_ID = new Types.ObjectId();
const BUSINESS_ID = new Types.ObjectId();

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  _id: USER_ID,
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  isActive: true,
  ...overrides,
});

const makeBusiness = () => ({
  _id: BUSINESS_ID,
  name: 'Acme Corp',
  ownerEmail: 'owner@acme.com',
  ownerFirstName: 'Bob',
});

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let adminUsersRepo: {
    findAll: jest.Mock;
    getStats: jest.Mock;
    findByIdWithBusiness: jest.Mock;
    updateById: jest.Mock;
    findManyByIds: jest.Mock;
    updateManyByIds: jest.Mock;
  };
  let usersRepo: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
  };
  let businessRepo: { findByName: jest.Mock };
  let agendaService: { now: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    adminUsersRepo = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      getStats: jest
        .fn()
        .mockResolvedValue({ total: 0, active: 0, suspended: 0 }),
      findByIdWithBusiness: jest.fn(),
      updateById: jest.fn().mockResolvedValue(undefined),
      findManyByIds: jest.fn().mockResolvedValue([]),
      updateManyByIds: jest.fn().mockResolvedValue(0),
    };
    usersRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
      updateById: jest.fn().mockResolvedValue(undefined),
    };
    businessRepo = { findByName: jest.fn() };
    agendaService = { now: jest.fn().mockResolvedValue(undefined) };
    config = { get: jest.fn().mockReturnValue('http://localhost:3000') };

    service = new AdminUsersService(
      asMock<AdminUsersRepository>(adminUsersRepo),
      asMock<UsersRepository>(usersRepo),
      asMock<BusinessRepository>(businessRepo),
      asMock<AgendaService>(agendaService),
      asMock<ConfigService>(config),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── listUsers ───────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('should return stats, users list, and pagination meta', async () => {
      // Arrange
      const users = [makeUser()];
      adminUsersRepo.findAll.mockResolvedValue({ data: users, total: 1 });
      adminUsersRepo.getStats.mockResolvedValue({
        total: 1,
        active: 1,
        suspended: 0,
      });

      // Act
      const result = await service.listUsers({ page: 1, limit: 10 });

      // Assert
      expect(result).toMatchObject({ stats: { total: 1, active: 1 }, users });
      expect(result).toHaveProperty('meta.total', 1);
    });

    it('should return InternalServerErrorException on failure', async () => {
      // Arrange
      adminUsersRepo.findAll.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.listUsers({});

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── getUserById ─────────────────────────────────────────────────────────────

  describe('getUserById', () => {
    it('should return enriched user profile when found', async () => {
      // Arrange
      const user = makeUser();
      adminUsersRepo.findByIdWithBusiness.mockResolvedValue(user);

      // Act
      const result = await service.getUserById(USER_ID.toString());

      // Assert
      expect(result).toEqual(user);
    });

    it('should return NotFoundException when user is not found', async () => {
      // Arrange
      adminUsersRepo.findByIdWithBusiness.mockResolvedValue(null);

      // Act
      const result = await service.getUserById('nonexistent');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      adminUsersRepo.findByIdWithBusiness.mockRejectedValue(new Error('crash'));

      // Act
      const result = await service.getUserById(USER_ID.toString());

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── toggleSuspend ───────────────────────────────────────────────────────────

  describe('toggleSuspend', () => {
    it('should suspend an active user', async () => {
      // Arrange
      usersRepo.findById.mockResolvedValue(makeUser({ isActive: true }));

      // Act
      const result = await service.toggleSuspend(USER_ID.toString());

      // Assert
      expect(result).toEqual({ suspended: true });
      expect(adminUsersRepo.updateById).toHaveBeenCalledWith(
        USER_ID.toString(),
        { isActive: false },
      );
    });

    it('should reactivate a suspended user', async () => {
      // Arrange
      usersRepo.findById.mockResolvedValue(makeUser({ isActive: false }));

      // Act
      const result = await service.toggleSuspend(USER_ID.toString());

      // Assert
      expect(result).toEqual({ suspended: false });
      expect(adminUsersRepo.updateById).toHaveBeenCalledWith(
        USER_ID.toString(),
        { isActive: true },
      );
    });

    it('should return NotFoundException when user is not found', async () => {
      // Arrange
      usersRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.toggleSuspend('bad-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── bulkToggleSuspend ───────────────────────────────────────────────────────

  describe('bulkToggleSuspend', () => {
    it('should suspend all users when at least one is active', async () => {
      // Arrange
      const users = [
        makeUser({ isActive: true }),
        makeUser({ isActive: false }),
      ];
      adminUsersRepo.findManyByIds.mockResolvedValue(users);
      adminUsersRepo.updateManyByIds.mockResolvedValue(2);

      // Act
      const result = await service.bulkToggleSuspend({
        userIds: users.map((u) => u._id.toString()),
      });

      // Assert
      expect(result).toEqual({ modifiedCount: 2 });
      expect(adminUsersRepo.updateManyByIds).toHaveBeenCalledWith(
        expect.any(Array),
        { isActive: false },
      );
    });

    it('should reactivate all when explicit suspend=false is passed', async () => {
      // Arrange
      const users = [makeUser({ isActive: false })];
      adminUsersRepo.findManyByIds.mockResolvedValue(users);
      adminUsersRepo.updateManyByIds.mockResolvedValue(1);

      // Act
      await service.bulkToggleSuspend({
        userIds: [USER_ID.toString()],
        suspend: false,
      });

      // Assert
      expect(adminUsersRepo.updateManyByIds).toHaveBeenCalledWith(
        expect.any(Array),
        { isActive: true },
      );
    });

    it('should return { modifiedCount: 0 } when no matching users are found', async () => {
      // Arrange
      adminUsersRepo.findManyByIds.mockResolvedValue([]);

      // Act
      const result = await service.bulkToggleSuspend({ userIds: ['bad-id'] });

      // Assert
      expect(result).toEqual({ modifiedCount: 0 });
    });
  });

  // ─── inviteUser ──────────────────────────────────────────────────────────────

  describe('inviteUser', () => {
    it('should create a user account and dispatch invitation email', async () => {
      // Arrange
      usersRepo.findByEmail.mockResolvedValue(null);
      jest
        .spyOn(hashUtil, 'generateStrongPassword')
        .mockReturnValue('TmpPass1!');
      jest.spyOn(hashUtil, 'hashValue').mockResolvedValue('hashed');

      // Act
      const result = await service.inviteUser({
        fullName: 'Alice Smith',
        email: 'alice@example.com',
        role: UserRole.OWNER,
      });

      // Assert
      expect(result).toBeNull();
      expect(usersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'alice@example.com',
          isEmailVerified: true,
          mustChangePassword: true,
          passwordHash: 'hashed',
        }),
      );
    });

    it('should resolve businessId when businessName is provided', async () => {
      // Arrange
      usersRepo.findByEmail.mockResolvedValue(null);
      businessRepo.findByName.mockResolvedValue(makeBusiness());
      jest.spyOn(hashUtil, 'generateStrongPassword').mockReturnValue('Tmp1!');
      jest.spyOn(hashUtil, 'hashValue').mockResolvedValue('hashed');

      // Act
      await service.inviteUser({
        fullName: 'Bob Owner',
        email: 'bob@acme.com',
        role: UserRole.OWNER,
        businessName: 'Acme Corp',
      });

      // Assert
      expect(usersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: BUSINESS_ID }),
      );
    });

    it('should return ConflictException when email is already registered', async () => {
      // Arrange
      usersRepo.findByEmail.mockResolvedValue(makeUser());

      // Act
      const result = await service.inviteUser({
        fullName: 'John Doe',
        email: 'john@example.com',
        role: UserRole.OWNER,
      });

      // Assert
      expect(result).toBeInstanceOf(ConflictException);
      expect(usersRepo.create).not.toHaveBeenCalled();
    });

    it('should return NotFoundException when businessName is not found', async () => {
      // Arrange
      usersRepo.findByEmail.mockResolvedValue(null);
      businessRepo.findByName.mockResolvedValue(null);

      // Act
      const result = await service.inviteUser({
        fullName: 'Eve Owner',
        email: 'eve@start.com',
        role: UserRole.OWNER,
        businessName: 'Unknown Corp',
      });

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── sendEmailToUser ─────────────────────────────────────────────────────────

  describe('sendEmailToUser', () => {
    it('should queue custom email for existing user', async () => {
      // Arrange
      usersRepo.findById.mockResolvedValue(makeUser());

      // Act
      const result = await service.sendEmailToUser(USER_ID.toString(), {
        subject: 'Hello',
        message: 'Test message',
      });

      // Assert
      expect(result).toBeNull();
      expect(agendaService.now).toHaveBeenCalledWith(
        expect.stringContaining('custom'),
        expect.objectContaining({ to: 'john@example.com', subject: 'Hello' }),
      );
    });

    it('should return NotFoundException when user does not exist', async () => {
      // Arrange
      usersRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.sendEmailToUser('bad-id', {
        subject: 'Hi',
        message: 'msg',
      });

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect(agendaService.now).not.toHaveBeenCalled();
    });
  });

  // ─── bulkSendEmail ──────────────────────────────────────────────────────────

  describe('bulkSendEmail', () => {
    it('should dispatch emails to all found users and return sent count', async () => {
      // Arrange
      const users = [
        makeUser(),
        makeUser({ email: 'jane@example.com', firstName: 'Jane' }),
      ];
      adminUsersRepo.findManyByIds.mockResolvedValue(users);

      // Act
      const result = await service.bulkSendEmail({
        userIds: users.map((u) => u._id.toString()),
        subject: 'Announcement',
        message: 'Hello everyone',
      });

      // Assert
      expect(result).toEqual({ sent: 2 });
      expect(agendaService.now).toHaveBeenCalledTimes(2);
    });

    it('should return { sent: 0 } when no users match', async () => {
      // Arrange
      adminUsersRepo.findManyByIds.mockResolvedValue([]);

      // Act
      const result = await service.bulkSendEmail({
        userIds: ['bad-id'],
        subject: 'Test',
        message: 'msg',
      });

      // Assert
      expect(result).toEqual({ sent: 0 });
    });
  });

  // ─── resetUserPassword ───────────────────────────────────────────────────────

  describe('resetUserPassword', () => {
    it('should generate OTP, store hash, and dispatch reset email', async () => {
      // Arrange
      usersRepo.findById.mockResolvedValue(makeUser());
      jest.spyOn(hashUtil, 'generateOtp').mockReturnValue('654321');
      jest.spyOn(hashUtil, 'hashToken').mockReturnValue('otp-hash');

      // Act
      const result = await service.resetUserPassword(USER_ID.toString());

      // Assert
      expect(result).toBeNull();
      expect(usersRepo.updateById).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ passwordResetToken: 'otp-hash' }),
      );
      expect(agendaService.now).toHaveBeenCalledWith(
        expect.stringContaining('reset'),
        expect.objectContaining({ to: 'john@example.com', otp: '654321' }),
      );
    });

    it('should return NotFoundException when user does not exist', async () => {
      // Arrange
      usersRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.resetUserPassword('unknown-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect(usersRepo.updateById).not.toHaveBeenCalled();
    });
  });
});
