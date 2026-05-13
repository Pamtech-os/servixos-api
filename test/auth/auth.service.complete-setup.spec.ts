import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import * as hashUtil from 'src/common/utils/hash.util';
import { AuthRepository } from 'src/modules/auth/repositories/auth.repository';
import { AuthService } from 'src/modules/auth/services/auth.service';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessCategoriesRepository } from 'src/modules/business-categories/repositories/business-categories.repository';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { RolesRepository } from 'src/modules/roles/repositories/roles.repository';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { UserRole } from 'src/modules/users/schemas/user.schema';
import { WebsiteConfigRepository } from 'src/modules/website/repositories/website-config.repository';
import { asMock } from 'test/helpers/mock';

const USER_ID = new Types.ObjectId();
const BUSINESS_ID = new Types.ObjectId();

describe('AuthService.completeSetup', () => {
  let service: AuthService;

  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let authRepository: { revokeAllUserRefreshTokens: jest.Mock };
  let usersRepository: { findById: jest.Mock; updateById: jest.Mock };

  beforeEach(() => {
    jwtService = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verify: jest.fn(),
    };

    authRepository = {
      revokeAllUserRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };

    usersRepository = {
      findById: jest.fn(),
      updateById: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      { startSession: jest.fn() } as never,
      asMock<JwtService>(jwtService),
      asMock<AuthRepository>(authRepository),
      asMock<UsersRepository>(usersRepository),
      asMock<BusinessRepository>({ findById: jest.fn() }),
      asMock<RolesRepository>({
        findById: jest.fn(),
        createDefaultRoles: jest.fn(),
      }),
      asMock<WebsiteConfigRepository>({ create: jest.fn() }),
      asMock<BusinessCategoriesRepository>({
        findById: jest.fn(),
      }),
      asMock<AgendaService>({ now: jest.fn() }),
      asMock<RedisService>({
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
      }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows invited staff users to complete setup', async () => {
    jest.spyOn(hashUtil, 'hashValue').mockResolvedValue('hashed-value');

    jwtService.verify.mockReturnValue({
      sub: USER_ID.toString(),
      businessId: BUSINESS_ID.toString(),
      userRole: UserRole.STAFF,
      pinVerified: false,
    });

    usersRepository.findById.mockResolvedValue({
      _id: USER_ID,
      businessId: BUSINESS_ID,
      userRole: UserRole.STAFF,
      isActive: true,
      deletedAt: null,
      mustChangePassword: true,
    });

    const result = await service.completeSetup('Bearer token', {
      newPassword: 'NewPassword123',
      confirmPassword: 'NewPassword123',
      pin: '7788',
      confirmPin: '7788',
    });

    expect(result).toEqual({ accessToken: 'signed-token' });
    expect(usersRepository.updateById).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        mustChangePassword: false,
        passwordHash: 'hashed-value',
        pinHash: 'hashed-value',
      }),
    );
    expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith(
      USER_ID,
    );
  });

  it('still allows legacy employee users to complete setup', async () => {
    jest.spyOn(hashUtil, 'hashValue').mockResolvedValue('hashed-value');

    jwtService.verify.mockReturnValue({
      sub: USER_ID.toString(),
      businessId: BUSINESS_ID.toString(),
      userRole: UserRole.EMPLOYEE,
      pinVerified: false,
    });

    usersRepository.findById.mockResolvedValue({
      _id: USER_ID,
      businessId: BUSINESS_ID,
      userRole: UserRole.EMPLOYEE,
      isActive: true,
      deletedAt: null,
      mustChangePassword: true,
    });

    const result = await service.completeSetup('Bearer token', {
      newPassword: 'NewPassword123',
      confirmPassword: 'NewPassword123',
      pin: '7788',
      confirmPin: '7788',
    });

    expect(result).toEqual({ accessToken: 'signed-token' });
  });

  it('returns setup not required for non-staff roles', async () => {
    jwtService.verify.mockReturnValue({
      sub: USER_ID.toString(),
      businessId: BUSINESS_ID.toString(),
      userRole: UserRole.OWNER,
      pinVerified: false,
    });

    usersRepository.findById.mockResolvedValue({
      _id: USER_ID,
      businessId: BUSINESS_ID,
      userRole: UserRole.OWNER,
      isActive: true,
      deletedAt: null,
      mustChangePassword: true,
    });

    const result = await service.completeSetup('Bearer token', {
      newPassword: 'NewPassword123',
      confirmPassword: 'NewPassword123',
      pin: '7788',
      confirmPin: '7788',
    });

    expect(result).toBeInstanceOf(BadRequestException);
    expect(result).not.toBeInstanceOf(UnauthorizedException);
    expect(result).not.toBeInstanceOf(InternalServerErrorException);
  });
});
