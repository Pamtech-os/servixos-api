import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { JwtUser } from 'src/common/decorators/current-user.decorator';
import { PermissionsContextGuard } from 'src/common/guards/permissions-context.guard';
import { PERMISSIONS_KEY } from 'src/common/decorators/permissions.decorator';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { RolesRepository } from 'src/modules/roles/repositories/roles.repository';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { UserRole } from 'src/modules/users/schemas/user.schema';
import { asMock } from 'test/helpers/mock';

function contextWithUser(user?: JwtUser): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getClass: () => PermissionsContextGuard,
    getHandler: () => undefined,
  } as unknown as ExecutionContext;
}

describe('PermissionsContextGuard', () => {
  let guard: PermissionsContextGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let usersRepository: { findById: jest.Mock };
  let rolesRepository: { findById: jest.Mock };
  let redisService: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    usersRepository = { findById: jest.fn() };
    rolesRepository = { findById: jest.fn() };
    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    guard = new PermissionsContextGuard(
      reflector as unknown as Reflector,
      asMock<UsersRepository>(usersRepository),
      asMock<RolesRepository>(rolesRepository),
      asMock<RedisService>(redisService),
    );
  });

  it('skips hydration when route has no @Permissions metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await guard.canActivate(
      contextWithUser({
        sub: 'u1',
        businessId: 'b1',
        userRole: UserRole.OWNER,
        pinVerified: true,
      }),
    );

    expect(result).toBe(true);
    expect(usersRepository.findById).not.toHaveBeenCalled();
  });

  it('hydrates permissions from role and caches them when metadata exists', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === PERMISSIONS_KEY ? ['tasks.view'] : undefined,
    );

    const roleId = new Types.ObjectId();
    const businessId = new Types.ObjectId();
    const reqUser: JwtUser = {
      sub: new Types.ObjectId().toString(),
      businessId: businessId.toString(),
      userRole: UserRole.EMPLOYEE,
      pinVerified: true,
    };

    usersRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(reqUser.sub),
      roleId,
      businessId,
      deletedAt: null,
    });
    rolesRepository.findById.mockResolvedValue({
      _id: roleId,
      permissions: ['tasks.view', 'tasks.edit'],
    });

    const result = await guard.canActivate(contextWithUser(reqUser));

    expect(result).toBe(true);
    expect(reqUser.permissions).toEqual(['tasks.view', 'tasks.edit']);
    expect(redisService.set).toHaveBeenCalledTimes(1);
  });

  it('assigns all permissions for owners and skips role hydration', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === PERMISSIONS_KEY ? ['tasks.view'] : undefined,
    );

    const reqUser: JwtUser = {
      sub: new Types.ObjectId().toString(),
      businessId: new Types.ObjectId().toString(),
      userRole: UserRole.OWNER,
      pinVerified: true,
    };

    const result = await guard.canActivate(contextWithUser(reqUser));

    expect(result).toBe(true);
    expect(Array.isArray(reqUser.permissions)).toBe(true);
    expect(reqUser.permissions).toContain('tasks.view');
    expect(usersRepository.findById).not.toHaveBeenCalled();
    expect(rolesRepository.findById).not.toHaveBeenCalled();
  });
});
