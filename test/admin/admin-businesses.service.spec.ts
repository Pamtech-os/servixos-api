import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminBusinessesService } from 'src/modules/admin/services/admin-businesses.service';
import { AdminBusinessesRepository } from 'src/modules/admin/repositories/admin-businesses.repository';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { asMock } from 'test/helpers/mock';

const BIZ_ID = new Types.ObjectId();

const makeBusiness = (overrides: Record<string, unknown> = {}) => ({
  _id: BIZ_ID,
  name: 'Acme Corp',
  isSuspended: false,
  ownerEmail: 'owner@acme.com',
  ownerFirstName: 'Bob',
  ...overrides,
});

describe('AdminBusinessesService', () => {
  let service: AdminBusinessesService;
  let repo: {
    findAll: jest.Mock;
    findByIdWithOwner: jest.Mock;
    updateById: jest.Mock;
    updateManyByIds: jest.Mock;
    deactivateAllStaff: jest.Mock;
    reactivateAllStaff: jest.Mock;
    findManyByIds: jest.Mock;
  };
  let agendaService: { now: jest.Mock };

  beforeEach(() => {
    repo = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findByIdWithOwner: jest.fn(),
      updateById: jest.fn().mockResolvedValue(undefined),
      updateManyByIds: jest.fn().mockResolvedValue(0),
      deactivateAllStaff: jest.fn().mockResolvedValue(undefined),
      reactivateAllStaff: jest.fn().mockResolvedValue(undefined),
      findManyByIds: jest.fn().mockResolvedValue([]),
    };
    agendaService = { now: jest.fn().mockResolvedValue(undefined) };

    service = new AdminBusinessesService(
      asMock<AdminBusinessesRepository>(repo),
      asMock<AgendaService>(agendaService),
    );
  });

  // ─── listBusinesses ──────────────────────────────────────────────────────────

  describe('listBusinesses', () => {
    it('should return paginated businesses with meta', async () => {
      // Arrange
      const businesses = [makeBusiness()];
      repo.findAll.mockResolvedValue({ data: businesses, total: 1 });

      // Act
      const result = await service.listBusinesses({ page: 1, limit: 10 });

      // Assert
      expect(result).toMatchObject({ businesses });
      expect(result).toHaveProperty('meta.total', 1);
    });

    it('should return InternalServerErrorException on failure', async () => {
      // Arrange
      repo.findAll.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.listBusinesses({});

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── getBusinessById ─────────────────────────────────────────────────────────

  describe('getBusinessById', () => {
    it('should return business with owner details when found', async () => {
      // Arrange
      const business = makeBusiness();
      repo.findByIdWithOwner.mockResolvedValue(business);

      // Act
      const result = await service.getBusinessById(BIZ_ID.toString());

      // Assert
      expect(result).toEqual(business);
    });

    it('should return NotFoundException when business does not exist', async () => {
      // Arrange
      repo.findByIdWithOwner.mockResolvedValue(null);

      // Act
      const result = await service.getBusinessById('nonexistent');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── suspendBusiness ─────────────────────────────────────────────────────────

  describe('suspendBusiness', () => {
    it('should suspend business and deactivate all staff', async () => {
      // Arrange
      repo.findByIdWithOwner.mockResolvedValue(
        makeBusiness({ isSuspended: false }),
      );

      // Act
      const result = await service.suspendBusiness(BIZ_ID.toString());

      // Assert
      expect(result).toBeNull();
      expect(repo.updateById).toHaveBeenCalledWith(
        BIZ_ID.toString(),
        expect.objectContaining({ isSuspended: true }),
      );
      expect(repo.deactivateAllStaff).toHaveBeenCalledWith([BIZ_ID.toString()]);
    });

    it('should return NotFoundException when business does not exist', async () => {
      // Arrange
      repo.findByIdWithOwner.mockResolvedValue(null);

      // Act
      const result = await service.suspendBusiness('unknown-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect(repo.updateById).not.toHaveBeenCalled();
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      repo.findByIdWithOwner.mockRejectedValue(new Error('crash'));

      // Act
      const result = await service.suspendBusiness(BIZ_ID.toString());

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── reactivateBusiness ──────────────────────────────────────────────────────

  describe('reactivateBusiness', () => {
    it('should reactivate business and restore all staff', async () => {
      // Arrange
      repo.findByIdWithOwner.mockResolvedValue(
        makeBusiness({ isSuspended: true }),
      );

      // Act
      const result = await service.reactivateBusiness(BIZ_ID.toString());

      // Assert
      expect(result).toBeNull();
      expect(repo.updateById).toHaveBeenCalledWith(
        BIZ_ID.toString(),
        expect.objectContaining({ isSuspended: false }),
      );
      expect(repo.reactivateAllStaff).toHaveBeenCalledWith([BIZ_ID.toString()]);
    });

    it('should return NotFoundException when business does not exist', async () => {
      // Arrange
      repo.findByIdWithOwner.mockResolvedValue(null);

      // Act
      const result = await service.reactivateBusiness('unknown-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── bulkToggleSuspend ───────────────────────────────────────────────────────

  describe('bulkToggleSuspend', () => {
    it('should suspend all when at least one business is active', async () => {
      // Arrange
      const businesses = [
        makeBusiness({ isSuspended: false }),
        makeBusiness({ isSuspended: true }),
      ];
      repo.findManyByIds.mockResolvedValue(businesses);
      repo.updateManyByIds.mockResolvedValue(2);

      // Act
      const result = await service.bulkToggleSuspend({
        businessIds: businesses.map((b) => b._id.toString()),
      });

      // Assert
      expect(result).toMatchObject({ modifiedCount: 2, suspended: true });
      expect(repo.deactivateAllStaff).toHaveBeenCalled();
      expect(repo.reactivateAllStaff).not.toHaveBeenCalled();
    });

    it('should reactivate all when all businesses are already suspended', async () => {
      // Arrange
      const businesses = [
        makeBusiness({ isSuspended: true }),
        makeBusiness({ isSuspended: true }),
      ];
      repo.findManyByIds.mockResolvedValue(businesses);
      repo.updateManyByIds.mockResolvedValue(2);

      // Act
      const result = await service.bulkToggleSuspend({
        businessIds: businesses.map((b) => b._id.toString()),
      });

      // Assert
      expect(result).toMatchObject({ suspended: false });
      expect(repo.reactivateAllStaff).toHaveBeenCalled();
      expect(repo.deactivateAllStaff).not.toHaveBeenCalled();
    });

    it('should return { modifiedCount: 0, suspended: false } when no businesses match', async () => {
      // Arrange
      repo.findManyByIds.mockResolvedValue([]);

      // Act
      const result = await service.bulkToggleSuspend({
        businessIds: ['bad-id'],
      });

      // Assert
      expect(result).toEqual({ modifiedCount: 0, suspended: false });
    });
  });

  // ─── sendEmailToBusiness ─────────────────────────────────────────────────────

  describe('sendEmailToBusiness', () => {
    it('should queue email to business owner when found', async () => {
      // Arrange
      repo.findByIdWithOwner.mockResolvedValue(makeBusiness());

      // Act
      const result = await service.sendEmailToBusiness(BIZ_ID.toString(), {
        subject: 'Important notice',
        message: 'Please review your account.',
      });

      // Assert
      expect(result).toBeNull();
      expect(agendaService.now).toHaveBeenCalledWith(
        expect.stringContaining('custom'),
        expect.objectContaining({
          to: 'owner@acme.com',
          subject: 'Important notice',
        }),
      );
    });

    it('should return NotFoundException when business does not exist', async () => {
      // Arrange
      repo.findByIdWithOwner.mockResolvedValue(null);

      // Act
      const result = await service.sendEmailToBusiness('bad-id', {
        subject: 'Hello',
        message: 'msg',
      });

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect(agendaService.now).not.toHaveBeenCalled();
    });
  });

  // ─── bulkSendEmail ──────────────────────────────────────────────────────────

  describe('bulkSendEmail', () => {
    it('should dispatch emails to all businesses with an owner email', async () => {
      // Arrange
      const businesses = [
        makeBusiness({ ownerEmail: 'a@biz.com' }),
        makeBusiness({ ownerEmail: 'b@biz.com' }),
      ];
      repo.findManyByIds.mockResolvedValue(businesses);

      // Act
      const result = await service.bulkSendEmail({
        businessIds: businesses.map((b) => b._id.toString()),
        subject: 'Update',
        message: 'Platform update',
      });

      // Assert
      expect(result).toEqual({ sent: 2 });
      expect(agendaService.now).toHaveBeenCalledTimes(2);
    });

    it('should skip businesses without an owner email', async () => {
      // Arrange
      const businesses = [
        makeBusiness({ ownerEmail: 'ok@biz.com' }),
        makeBusiness({ ownerEmail: undefined }),
      ];
      repo.findManyByIds.mockResolvedValue(businesses);

      // Act
      const result = await service.bulkSendEmail({
        businessIds: businesses.map((b) => b._id.toString()),
        subject: 'Test',
        message: 'msg',
      });

      // Assert
      expect(agendaService.now).toHaveBeenCalledTimes(1);
      // sent count is total found, not filtered
      expect(result).toMatchObject({ sent: 2 });
    });

    it('should return InternalServerErrorException on failure', async () => {
      // Arrange
      repo.findManyByIds.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.bulkSendEmail({
        businessIds: ['id'],
        subject: 'X',
        message: 'Y',
      });

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });
});
