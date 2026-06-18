import {
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { SETTINGS_MESSAGES } from 'src/common/constants/messages/settings.messages';
import { AuthRepository } from 'src/modules/auth/repositories/auth.repository';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { Business } from 'src/modules/business/schemas/business.schema';
import { SettingsService } from 'src/modules/settings/services/settings.service';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { User } from 'src/modules/users/schemas/user.schema';
import { asMock } from 'test/helpers/mock';
import * as hashUtil from 'src/common/utils/hash.util';

const BUSINESS_ID = '664abc123456789012345678';
const USER_ID = '664abc000000000000000001';
const bId = new Types.ObjectId(BUSINESS_ID);
const uId = new Types.ObjectId(USER_ID);

const baseBusiness: Partial<Business> = {
  _id: bId,
  name: 'Acme Services',
  categoryName: 'Field Services',
  email: 'info@acme.com',
  phone: '+15555555555',
  address: '123 Main St',
  description: 'A test business',
  notifications: { email: true, newClient: true, payment: false },
};

const baseUser: Partial<User> = {
  _id: uId,
  passwordHash: '$2b$10$hashedpassword',
  isActive: true,
};

describe('SettingsService', () => {
  let service: SettingsService;
  let businessRepository: {
    findById: jest.Mock;
    updateById: jest.Mock;
    softDeleteById: jest.Mock;
  };
  let usersRepository: {
    findById: jest.Mock;
    updateById: jest.Mock;
    softDeleteById: jest.Mock;
  };
  let authRepository: {
    revokeAllUserRefreshTokens: jest.Mock;
  };
  let mockConnection: { startSession: jest.Mock };
  let mockSession: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    endSession: jest.Mock;
  };

  beforeEach(() => {
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };
    businessRepository = {
      findById: jest.fn().mockResolvedValue(baseBusiness),
      updateById: jest.fn().mockResolvedValue(undefined),
      softDeleteById: jest.fn().mockResolvedValue(undefined),
    };
    usersRepository = {
      findById: jest.fn().mockResolvedValue(baseUser),
      updateById: jest.fn().mockResolvedValue(undefined),
      softDeleteById: jest.fn().mockResolvedValue(undefined),
    };
    authRepository = {
      revokeAllUserRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };

    service = new SettingsService(
      mockConnection as never,
      asMock<BusinessRepository>(businessRepository),
      asMock<UsersRepository>(usersRepository),
      asMock<AuthRepository>(authRepository),
    );
  });

  // ─── getProfile ──────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return the business profile', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue(baseBusiness);

      // Act
      const result = await service.getProfile(BUSINESS_ID);

      // Assert
      expect(result.message).toBe(SETTINGS_MESSAGES.SUCCESS.PROFILE_RETRIEVED);
      expect(result.data).toMatchObject({
        name: 'Acme Services',
        categoryName: 'Field Services',
      });
    });

    it('should throw NotFoundException when business does not exist', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getProfile(BUSINESS_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateProfile ───────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('should update the business profile and return success', async () => {
      // Arrange
      const dto = { name: 'New Name', email: 'new@example.com' };

      // Act
      const result = await service.updateProfile(BUSINESS_ID, dto);

      // Assert
      expect(result).toMatchObject({
        message: SETTINGS_MESSAGES.SUCCESS.PROFILE_UPDATED,
      });
      expect(businessRepository.updateById).toHaveBeenCalledWith(
        BUSINESS_ID,
        expect.objectContaining({ name: 'New Name', email: 'new@example.com' }),
      );
    });

    it('should return NotFoundException when business does not exist', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.updateProfile(BUSINESS_ID, {});

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      businessRepository.findById.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.updateProfile(BUSINESS_ID, {});

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── getNotifications ────────────────────────────────────────────────────────

  describe('getNotifications', () => {
    it('should return the notification preferences', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue(baseBusiness);

      // Act
      const result = await service.getNotifications(BUSINESS_ID);

      // Assert
      expect(result.message).toBe(
        SETTINGS_MESSAGES.SUCCESS.NOTIFICATIONS_RETRIEVED,
      );
      expect(result.data).toEqual(baseBusiness.notifications);
    });

    it('should throw NotFoundException when business does not exist', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getNotifications(BUSINESS_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateNotifications ─────────────────────────────────────────────────────

  describe('updateNotifications', () => {
    it('should update notification preferences and return success', async () => {
      // Arrange
      const dto = { email: false, payment: true };

      // Act
      const result = await service.updateNotifications(BUSINESS_ID, dto);

      // Assert
      expect(result).toMatchObject({
        message: SETTINGS_MESSAGES.SUCCESS.NOTIFICATIONS_UPDATED,
      });
      expect(businessRepository.updateById).toHaveBeenCalledWith(
        BUSINESS_ID,
        expect.objectContaining({
          'notifications.email': false,
          'notifications.payment': true,
        }),
      );
    });

    it('should return NotFoundException when business does not exist', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.updateNotifications(BUSINESS_ID, {});

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── updatePassword ──────────────────────────────────────────────────────────

  describe('updatePassword', () => {
    it('should update the password when current password is correct', async () => {
      // Arrange
      jest.spyOn(hashUtil, 'compareValue').mockResolvedValue(true);
      jest.spyOn(hashUtil, 'hashValue').mockResolvedValue('$2b$10$newhash');
      const dto = {
        currentPassword: 'OldPass1',
        newPassword: 'NewPass1',
        confirmPassword: 'NewPass1',
      };

      // Act
      const result = await service.updatePassword(USER_ID, dto);

      // Assert
      expect(result).toMatchObject({
        message: SETTINGS_MESSAGES.SUCCESS.PASSWORD_UPDATED,
      });
      expect(usersRepository.updateById).toHaveBeenCalledWith(
        uId,
        expect.objectContaining({ passwordHash: '$2b$10$newhash' }),
      );
    });

    it('should return UnauthorizedException when current password is wrong', async () => {
      // Arrange
      jest.spyOn(hashUtil, 'compareValue').mockResolvedValue(false);
      const dto = {
        currentPassword: 'WrongPass1',
        newPassword: 'NewPass1',
        confirmPassword: 'NewPass1',
      };

      // Act
      const result = await service.updatePassword(USER_ID, dto);

      // Assert
      expect(result).toBeInstanceOf(UnauthorizedException);
    });

    it('should return NotFoundException when user does not exist', async () => {
      // Arrange
      usersRepository.findById.mockResolvedValue(null);
      const dto = {
        currentPassword: 'OldPass1',
        newPassword: 'NewPass1',
        confirmPassword: 'NewPass1',
      };

      // Act
      const result = await service.updatePassword(USER_ID, dto);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── deleteAccount ───────────────────────────────────────────────────────────

  describe('deleteAccount', () => {
    it('should soft-delete the account and revoke tokens', async () => {
      // Arrange
      usersRepository.findById.mockResolvedValue(baseUser);

      // Act
      const result = await service.deleteAccount(USER_ID, BUSINESS_ID);

      // Assert
      expect(result).toMatchObject({
        message: SETTINGS_MESSAGES.SUCCESS.ACCOUNT_DELETED,
      });
      expect(usersRepository.softDeleteById).toHaveBeenCalledWith(
        uId,
        mockSession,
      );
      expect(businessRepository.softDeleteById).toHaveBeenCalledWith(
        BUSINESS_ID,
        mockSession,
      );
      expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith(
        uId,
        mockSession,
      );
    });

    it('should return NotFoundException when user does not exist', async () => {
      // Arrange
      usersRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.deleteAccount(USER_ID, BUSINESS_ID);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should return InternalServerErrorException and abort transaction on DB error', async () => {
      // Arrange
      usersRepository.findById.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.deleteAccount(USER_ID, BUSINESS_ID);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });
});
