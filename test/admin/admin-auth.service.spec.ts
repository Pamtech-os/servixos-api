import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import * as hashUtil from 'src/common/utils/hash.util';
import { AdminAuthService } from 'src/modules/admin/services/admin-auth.service';
import { AdminRepository } from 'src/modules/admin/repositories/admin.repository';
import { AdminAuthRepository } from 'src/modules/admin/repositories/admin-auth.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { asMock } from 'test/helpers/mock';

const ADMIN_ID = new Types.ObjectId();

const makeAdmin = (overrides: Record<string, unknown> = {}) => ({
  _id: ADMIN_ID,
  firstName: 'Super',
  lastName: 'Admin',
  email: 'admin@servixos.com',
  passwordHash: 'hashed',
  isActive: true,
  isDefault: true,
  isInvited: false,
  mustChangePassword: false,
  ...overrides,
});

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let adminRepository: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
  };
  let adminAuthRepository: {
    createRefreshToken: jest.Mock;
    findValidToken: jest.Mock;
    revokeToken: jest.Mock;
  };
  let redisService: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
  let agendaService: { now: jest.Mock };

  beforeEach(() => {
    jwtService = {
      sign: jest.fn().mockReturnValue('access-token'),
      verify: jest.fn(),
    };
    adminRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn().mockResolvedValue(null),
    };
    adminAuthRepository = {
      createRefreshToken: jest.fn().mockResolvedValue({}),
      findValidToken: jest.fn(),
      revokeToken: jest.fn().mockResolvedValue(undefined),
    };
    redisService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(undefined),
    };
    agendaService = { now: jest.fn().mockResolvedValue(undefined) };

    service = new AdminAuthService(
      asMock<JwtService>(jwtService),
      asMock<AdminRepository>(adminRepository),
      asMock<AdminAuthRepository>(adminAuthRepository),
      asMock<RedisService>(redisService),
      asMock<AgendaService>(agendaService),
    );

    jest.spyOn(hashUtil, 'generateSecureToken').mockReturnValue('raw-refresh');
    jest.spyOn(hashUtil, 'hashToken').mockReturnValue('token-hash');
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should return tokens and mustChangePassword flag on valid credentials', async () => {
      // Arrange
      adminRepository.findByEmail.mockResolvedValue(
        makeAdmin({ mustChangePassword: true }),
      );
      jest.spyOn(hashUtil, 'compareValue').mockResolvedValue(true);

      // Act
      const result = await service.login({
        email: 'admin@servixos.com',
        password: 'pass',
      });

      // Assert
      expect(result).toMatchObject({
        accessToken: 'access-token',
        refreshToken: 'raw-refresh',
        mustChangePassword: true,
        admin: { id: ADMIN_ID.toString() },
      });
    });

    it('should return OTP pending response for invited admin', async () => {
      // Arrange
      adminRepository.findByEmail.mockResolvedValue(
        makeAdmin({ isInvited: true }),
      );
      jest.spyOn(hashUtil, 'compareValue').mockResolvedValue(true);
      jest.spyOn(hashUtil, 'generateOtp').mockReturnValue('123456');
      jest.spyOn(hashUtil, 'hashValue').mockResolvedValue('hashed-otp');

      // Act
      const result = await service.login({
        email: 'admin@servixos.com',
        password: 'pass',
      });

      // Assert
      expect(result).toMatchObject({
        requiresOtp: true,
        otpToken: 'access-token',
      });
      expect(redisService.set).toHaveBeenCalledWith(
        `admin:otp:${ADMIN_ID.toString()}`,
        'hashed-otp',
        600,
      );
      expect(agendaService.now).toHaveBeenCalledWith(
        'email:admin:otp',
        expect.objectContaining({ otp: '123456' }),
      );
    });

    it('should not issue session tokens for invited admin', async () => {
      // Arrange
      adminRepository.findByEmail.mockResolvedValue(
        makeAdmin({ isInvited: true }),
      );
      jest.spyOn(hashUtil, 'compareValue').mockResolvedValue(true);
      jest.spyOn(hashUtil, 'generateOtp').mockReturnValue('111111');
      jest.spyOn(hashUtil, 'hashValue').mockResolvedValue('h');

      // Act
      await service.login({ email: 'admin@servixos.com', password: 'pass' });

      // Assert
      expect(adminAuthRepository.createRefreshToken).not.toHaveBeenCalled();
    });

    it('should return UnauthorizedException when admin is not found', async () => {
      // Arrange
      adminRepository.findByEmail.mockResolvedValue(null);

      // Act
      const result = await service.login({
        email: 'bad@test.com',
        password: 'pass',
      });

      // Assert
      expect(result).toBeInstanceOf(UnauthorizedException);
    });

    it('should return UnauthorizedException when admin is inactive', async () => {
      // Arrange
      adminRepository.findByEmail.mockResolvedValue(
        makeAdmin({ isActive: false }),
      );

      // Act
      const result = await service.login({
        email: 'admin@servixos.com',
        password: 'pass',
      });

      // Assert
      expect(result).toBeInstanceOf(UnauthorizedException);
    });

    it('should return UnauthorizedException on wrong password', async () => {
      // Arrange
      adminRepository.findByEmail.mockResolvedValue(makeAdmin());
      jest.spyOn(hashUtil, 'compareValue').mockResolvedValue(false);

      // Act
      const result = await service.login({
        email: 'admin@servixos.com',
        password: 'wrong',
      });

      // Assert
      expect(result).toBeInstanceOf(UnauthorizedException);
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      adminRepository.findByEmail.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.login({
        email: 'admin@servixos.com',
        password: 'pass',
      });

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── verifyOtp ──────────────────────────────────────────────────────────────

  describe('verifyOtp', () => {
    const OTP_TOKEN = 'valid-otp-token';
    const VALID_PAYLOAD = {
      sub: ADMIN_ID.toString(),
      email: 'admin@servixos.com',
      purpose: 'admin-otp',
      aud: 'admin',
    };

    it('should issue full session after correct OTP is submitted', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(VALID_PAYLOAD);
      redisService.get.mockResolvedValue('hashed-otp');
      jest.spyOn(hashUtil, 'compareValue').mockResolvedValue(true);
      adminRepository.findById.mockResolvedValue(makeAdmin());

      // Act
      const result = await service.verifyOtp({
        otpToken: OTP_TOKEN,
        otp: '123456',
      });

      // Assert
      expect(result).toMatchObject({
        accessToken: 'access-token',
        refreshToken: 'raw-refresh',
        admin: { id: ADMIN_ID.toString() },
      });
      expect(redisService.del).toHaveBeenCalledWith(
        `admin:otp:${ADMIN_ID.toString()}`,
      );
    });

    it('should delete OTP from Redis after successful verification', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(VALID_PAYLOAD);
      redisService.get.mockResolvedValue('hashed-otp');
      jest.spyOn(hashUtil, 'compareValue').mockResolvedValue(true);
      adminRepository.findById.mockResolvedValue(makeAdmin());

      // Act
      await service.verifyOtp({ otpToken: OTP_TOKEN, otp: '123456' });

      // Assert — OTP consumed, not reusable
      expect(redisService.del).toHaveBeenCalledTimes(1);
    });

    it('should return UnauthorizedException when otpToken JWT is invalid', async () => {
      // Arrange
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      // Act
      const result = await service.verifyOtp({
        otpToken: 'bad-token',
        otp: '123456',
      });

      // Assert
      expect(result).toBeInstanceOf(UnauthorizedException);
    });

    it('should return UnauthorizedException when token purpose is not admin-otp', async () => {
      // Arrange
      jwtService.verify.mockReturnValue({
        ...VALID_PAYLOAD,
        purpose: 'session',
      });

      // Act
      const result = await service.verifyOtp({
        otpToken: OTP_TOKEN,
        otp: '123456',
      });

      // Assert
      expect(result).toBeInstanceOf(UnauthorizedException);
    });

    it('should return UnauthorizedException when OTP is not in Redis (expired)', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(VALID_PAYLOAD);
      redisService.get.mockResolvedValue(null);

      // Act
      const result = await service.verifyOtp({
        otpToken: OTP_TOKEN,
        otp: '123456',
      });

      // Assert
      expect(result).toBeInstanceOf(UnauthorizedException);
    });

    it('should return UnauthorizedException when OTP value is incorrect', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(VALID_PAYLOAD);
      redisService.get.mockResolvedValue('hashed-otp');
      jest.spyOn(hashUtil, 'compareValue').mockResolvedValue(false);

      // Act
      const result = await service.verifyOtp({
        otpToken: OTP_TOKEN,
        otp: 'wrong',
      });

      // Assert
      expect(result).toBeInstanceOf(UnauthorizedException);
      expect(redisService.del).not.toHaveBeenCalled();
    });
  });

  // ─── changePassword ─────────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('should hash new password and clear mustChangePassword flag', async () => {
      // Arrange
      adminRepository.findById.mockResolvedValue(
        makeAdmin({ mustChangePassword: true }),
      );
      jest.spyOn(hashUtil, 'compareValue').mockResolvedValue(true);
      jest.spyOn(hashUtil, 'hashValue').mockResolvedValue('new-hash');

      // Act
      const result = await service.changePassword(ADMIN_ID.toString(), {
        currentPassword: 'old-pass',
        newPassword: 'NewSecure123!',
      });

      // Assert
      expect(result).toEqual({ changed: true });
      expect(adminRepository.updateById).toHaveBeenCalledWith(
        ADMIN_ID.toString(),
        expect.objectContaining({
          passwordHash: 'new-hash',
          mustChangePassword: false,
        }),
      );
    });

    it('should return BadRequestException when current password is wrong', async () => {
      // Arrange
      adminRepository.findById.mockResolvedValue(makeAdmin());
      jest.spyOn(hashUtil, 'compareValue').mockResolvedValue(false);

      // Act
      const result = await service.changePassword(ADMIN_ID.toString(), {
        currentPassword: 'wrong',
        newPassword: 'NewSecure123!',
      });

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
      expect(adminRepository.updateById).not.toHaveBeenCalled();
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      adminRepository.findById.mockRejectedValue(new Error('DB crash'));

      // Act
      const result = await service.changePassword(ADMIN_ID.toString(), {
        currentPassword: 'pass',
        newPassword: 'NewSecure123!',
      });

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── refreshToken ───────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('should return new accessToken for valid refresh token', async () => {
      // Arrange
      adminAuthRepository.findValidToken.mockResolvedValue({
        adminId: ADMIN_ID,
      });
      adminRepository.findById.mockResolvedValue(makeAdmin());

      // Act
      const result = await service.refreshToken({
        refreshToken: 'raw-refresh',
      });

      // Assert
      expect(result).toEqual({ accessToken: 'access-token' });
    });

    it('should return UnauthorizedException for unknown refresh token', async () => {
      // Arrange
      adminAuthRepository.findValidToken.mockResolvedValue(null);

      // Act
      const result = await service.refreshToken({ refreshToken: 'stale' });

      // Assert
      expect(result).toBeInstanceOf(UnauthorizedException);
    });

    it('should return UnauthorizedException when admin linked to token is inactive', async () => {
      // Arrange
      adminAuthRepository.findValidToken.mockResolvedValue({
        adminId: ADMIN_ID,
      });
      adminRepository.findById.mockResolvedValue(
        makeAdmin({ isActive: false }),
      );

      // Act
      const result = await service.refreshToken({
        refreshToken: 'raw-refresh',
      });

      // Assert
      expect(result).toBeInstanceOf(UnauthorizedException);
    });
  });
});
