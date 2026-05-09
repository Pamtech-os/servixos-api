import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { JOBS } from 'src/common/constants/agenda.constants';
import { CLIENT_AUTH_MESSAGES } from 'src/common/constants/messages/client-auth.messages';
import { hashValue } from 'src/common/utils/hash.util';
import { AuthRepository } from 'src/modules/auth/repositories/auth.repository';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { ClientsRepository } from 'src/modules/clients/repositories/clients.repository';
import { ClientAuthService } from 'src/modules/client-auth/services/client-auth.service';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { UserRole } from 'src/modules/users/schemas/user.schema';

const USER_ID = new Types.ObjectId();
const CLIENT_ID = new Types.ObjectId();
const BUSINESS_ID = new Types.ObjectId();

describe('ClientAuthService', () => {
  let service: ClientAuthService;
  let warnSpy: jest.SpyInstance;

  let mockConnection: {
    startSession: jest.Mock;
  };
  let mockSession: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    endSession: jest.Mock;
  };

  let jwtService: {
    sign: jest.Mock;
    verify: jest.Mock;
  };
  let authRepository: {
    findValidRefreshToken: jest.Mock;
    createRefreshToken: jest.Mock;
    revokeRefreshToken: jest.Mock;
    revokeAllUserRefreshTokens: jest.Mock;
  };
  let usersRepository: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    findByPasswordResetToken: jest.Mock;
  };
  let clientsRepository: {
    findByUserId: jest.Mock;
  };
  let businessRepository: {
    findById: jest.Mock;
  };
  let agendaService: {
    now: jest.Mock;
  };

  beforeAll(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      // Suppress expected negative-path auth warnings in test output.
    });
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

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

    jwtService = {
      sign: jest.fn().mockReturnValue('signed-access-token'),
      verify: jest.fn(),
    };

    authRepository = {
      findValidRefreshToken: jest.fn(),
      createRefreshToken: jest.fn().mockResolvedValue(undefined),
      revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
      revokeAllUserRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };

    usersRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn().mockResolvedValue(undefined),
      findByPasswordResetToken: jest.fn(),
    };

    clientsRepository = {
      findByUserId: jest.fn(),
    };

    businessRepository = {
      findById: jest.fn(),
    };

    agendaService = {
      now: jest.fn().mockResolvedValue(undefined),
    };

    service = new ClientAuthService(
      mockConnection as never,
      jwtService as unknown as JwtService,
      authRepository as unknown as AuthRepository,
      usersRepository as unknown as UsersRepository,
      clientsRepository as unknown as ClientsRepository,
      businessRepository as unknown as BusinessRepository,
      agendaService as never,
    );
  });

  describe('login', () => {
    let passwordHash: string;

    beforeAll(async () => {
      passwordHash = await hashValue('Password123');
    });

    it('logs in a valid client user and returns session tokens', async () => {
      const password = 'Password123';
      usersRepository.findByEmail.mockResolvedValue({
        _id: USER_ID,
        email: 'client@test.local',
        passwordHash,
        userRole: UserRole.CLIENT,
        businessId: BUSINESS_ID,
        isActive: true,
        isEmailVerified: true,
        mustChangePassword: true,
      });

      businessRepository.findById.mockResolvedValue({
        _id: BUSINESS_ID,
        name: 'Acme Services',
        timezone: 'America/New_York',
      });

      clientsRepository.findByUserId.mockResolvedValue({
        _id: CLIENT_ID,
        businessId: BUSINESS_ID,
        userId: USER_ID,
        name: 'John Client',
        email: 'client@test.local',
      });

      const result = await service.login(
        { email: 'client@test.local', password },
        '127.0.0.1',
        'jest-agent',
      );

      expect(result).not.toBeInstanceOf(UnauthorizedException);
      expect(result).not.toBeInstanceOf(InternalServerErrorException);

      const data = result as {
        accessToken: string;
        refreshToken: string;
        user: {
          id: string;
          clientId: string;
          businessId: string;
          mustChangePassword: boolean;
        };
      };

      expect(data.accessToken).toBe('signed-access-token');
      expect(typeof data.refreshToken).toBe('string');
      expect(data.refreshToken.length).toBeGreaterThan(0);
      expect(data.user).toMatchObject({
        id: USER_ID.toString(),
        clientId: CLIENT_ID.toString(),
        businessId: BUSINESS_ID.toString(),
        mustChangePassword: true,
      });

      const updateCalls = usersRepository.updateById.mock.calls as Array<
        [Types.ObjectId, { lastLoginAt?: Date }]
      >;
      expect(updateCalls[0]?.[0]).toEqual(USER_ID);
      expect(updateCalls[0]?.[1].lastLoginAt).toBeInstanceOf(Date);
      expect(authRepository.createRefreshToken).toHaveBeenCalledTimes(1);
      expect(agendaService.now).toHaveBeenCalledWith(
        JOBS.ACTIVITY_LOG_WRITE,
        expect.objectContaining({ actorId: USER_ID.toString() }),
      );
    });

    it('returns unauthorized for non-client users', async () => {
      usersRepository.findByEmail.mockResolvedValue({
        _id: USER_ID,
        email: 'owner@test.local',
        passwordHash: 'irrelevant',
        userRole: UserRole.OWNER,
        businessId: BUSINESS_ID,
        isActive: true,
      });

      const result = await service.login({
        email: 'owner@test.local',
        password: 'Password123',
      });

      expect(result).toBeInstanceOf(UnauthorizedException);
      expect((result as UnauthorizedException).message).toBe(
        CLIENT_AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
      );
    });
  });

  describe('refreshToken', () => {
    it('returns unauthorized when refresh token is invalid', async () => {
      authRepository.findValidRefreshToken.mockResolvedValue(null);

      const result = await service.refreshToken({
        refreshToken: 'invalid-token',
      });

      expect(result).toBeInstanceOf(UnauthorizedException);
      expect((result as UnauthorizedException).message).toBe(
        CLIENT_AUTH_MESSAGES.ERROR.EXPIRED_TOKEN,
      );
    });
  });

  describe('logout', () => {
    it('returns bad request when refresh token is missing', async () => {
      const result = await service.logout({ refreshToken: '' });

      expect(result).toBeInstanceOf(BadRequestException);
      expect((result as BadRequestException).message).toBe(
        CLIENT_AUTH_MESSAGES.ERROR.INVALID_TOKEN,
      );
    });
  });

  describe('resetPassword', () => {
    it('returns bad request when otp is invalid or expired', async () => {
      usersRepository.findByPasswordResetToken.mockResolvedValue(null);

      const result = await service.resetPassword({
        otp: '000000',
        newPassword: 'NewPassword123',
      });

      expect(result).toBeInstanceOf(BadRequestException);
      expect((result as BadRequestException).message).toBe(
        CLIENT_AUTH_MESSAGES.ERROR.INVALID_TOKEN,
      );
      expect(mockSession.abortTransaction).toHaveBeenCalledTimes(1);
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('returns not found when linked client profile does not exist', async () => {
      jwtService.verify.mockReturnValue({
        sub: USER_ID.toString(),
        businessId: BUSINESS_ID.toString(),
        userRole: UserRole.CLIENT,
        pinVerified: true,
        aud: 'client',
      });

      usersRepository.findById.mockResolvedValue({
        _id: USER_ID,
        email: 'client@test.local',
        userRole: UserRole.CLIENT,
        businessId: BUSINESS_ID,
        isActive: true,
      });
      businessRepository.findById.mockResolvedValue({
        _id: BUSINESS_ID,
        timezone: 'UTC',
      });
      clientsRepository.findByUserId.mockResolvedValue(null);

      const result = await service.getProfile('Bearer client-access-token');

      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        CLIENT_AUTH_MESSAGES.ERROR.PROFILE_NOT_FOUND,
      );
    });
  });
});
