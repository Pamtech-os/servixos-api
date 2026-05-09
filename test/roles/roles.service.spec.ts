import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { ROLES_MESSAGES } from 'src/common/constants/messages/roles.messages';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { RolesRepository } from 'src/modules/roles/repositories/roles.repository';
import { RolesService } from 'src/modules/roles/services/roles.service';
import { Role } from 'src/modules/roles/schemas/role.schema';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';

const BUSINESS_ID = '664abc123456789012345678';
const ROLE_ID = '664abc000000000000000001';

describe('RolesService', () => {
  let service: RolesService;
  let rolesRepository: {
    findAllByBusiness: jest.Mock;
    findById: jest.Mock;
    findByBusinessAndName: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    getAllPermissions: jest.Mock;
  };
  let redisService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let usersRepository: {
    countByRoleId: jest.Mock;
  };
  let connection: {
    startSession: jest.Mock;
  };
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let loggerErrorSpy: jest.SpyInstance;

  const baseRole: Role = {
    _id: new Types.ObjectId(ROLE_ID),
    businessId: new Types.ObjectId(BUSINESS_ID),
    name: 'Dispatcher',
    permissions: ['dashboard.view', 'jobs.view'],
    isSystem: false,
  };

  beforeEach(() => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection = {
      startSession: jest.fn().mockResolvedValue(session),
    };

    rolesRepository = {
      findAllByBusiness: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findByBusinessAndName: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      getAllPermissions: jest.fn().mockReturnValue(['dashboard.view']),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    usersRepository = {
      countByRoleId: jest.fn().mockResolvedValue(0),
    };

    service = new RolesService(
      connection as never,
      rolesRepository as unknown as RolesRepository,
      redisService as unknown as RedisService,
      usersRepository as unknown as UsersRepository,
    );

    loggerErrorSpy = jest
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('returns cached roles list when cache hits', async () => {
    const cached = [{ ...baseRole }];
    redisService.get.mockResolvedValueOnce(JSON.stringify(cached));

    const result = await service.listRoles(BUSINESS_ID);

    expect(rolesRepository.findAllByBusiness).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toEqual(JSON.stringify(cached));
  });

  it('creates role successfully and invalidates roles list cache', async () => {
    rolesRepository.findByBusinessAndName.mockResolvedValueOnce(null);
    rolesRepository.create.mockResolvedValueOnce(baseRole);

    const result = await service.createRole(BUSINESS_ID, {
      name: 'Dispatcher',
      permissions: ['dashboard.view', 'jobs.view'],
    });

    expect(result).not.toBeInstanceOf(InternalServerErrorException);
    expect(rolesRepository.create).toHaveBeenCalledTimes(1);
    expect(redisService.del).toHaveBeenCalledWith(`${BUSINESS_ID}:roles:list`);
  });

  it('returns conflict when role name already exists', async () => {
    rolesRepository.findByBusinessAndName.mockResolvedValueOnce(baseRole);

    const result = await service.createRole(BUSINESS_ID, {
      name: 'Dispatcher',
      permissions: ['dashboard.view'],
    });

    expect(result).toBeInstanceOf(ConflictException);
    expect((result as ConflictException).message).toBe(
      ROLES_MESSAGES.ERROR.NAME_TAKEN,
    );
  });

  it('returns bad request when permissions include invalid entries', async () => {
    const result = await service.createRole(BUSINESS_ID, {
      name: 'Dispatcher',
      permissions: ['jobs.view', 'invalid.permission'],
    });

    expect(result).toBeInstanceOf(BadRequestException);
    expect((result as BadRequestException).message).toBe(
      ROLES_MESSAGES.ERROR.INVALID_PERMISSION,
    );
  });

  it("returns forbidden when updating permissions of the owner's role", async () => {
    rolesRepository.findById.mockResolvedValueOnce({
      ...baseRole,
      name: 'Owner',
      isSystem: true,
      isOwnerRole: true,
    });

    const result = await service.updateRole(ROLE_ID, BUSINESS_ID, {
      permissions: ['jobs.view'],
    });

    expect(result).toBeInstanceOf(ForbiddenException);
    expect(rolesRepository.updateById).not.toHaveBeenCalled();
  });

  it('allows updating permissions for non-owner default roles', async () => {
    rolesRepository.findById.mockResolvedValueOnce({
      ...baseRole,
      name: 'Manager',
      isSystem: true,
      isOwnerRole: false,
    });
    rolesRepository.findByBusinessAndName.mockResolvedValueOnce(null);
    rolesRepository.updateById.mockResolvedValueOnce({
      ...baseRole,
      name: 'Manager',
      isSystem: true,
      isOwnerRole: false,
      permissions: ['jobs.view', 'jobs.edit'],
    });

    const result = await service.updateRole(ROLE_ID, BUSINESS_ID, {
      permissions: ['jobs.view', 'jobs.edit'],
    });

    expect(result).not.toBeInstanceOf(ForbiddenException);
    expect(rolesRepository.updateById).toHaveBeenCalledTimes(1);
  });

  it('returns forbidden when deleting a default role', async () => {
    rolesRepository.findById.mockResolvedValueOnce({
      ...baseRole,
      name: 'Owner',
      isSystem: true,
    });

    const result = await service.deleteRole(ROLE_ID, BUSINESS_ID);

    expect(result).toBeInstanceOf(ForbiddenException);
    expect(rolesRepository.deleteById).not.toHaveBeenCalled();
  });

  it('returns conflict when deleting role that still has attached users', async () => {
    rolesRepository.findById.mockResolvedValueOnce(baseRole);
    usersRepository.countByRoleId.mockResolvedValueOnce(2);

    const result = await service.deleteRole(ROLE_ID, BUSINESS_ID);

    expect(result).toBeInstanceOf(ConflictException);
    expect((result as ConflictException).message).toBe(
      ROLES_MESSAGES.ERROR.ROLE_IN_USE,
    );
    expect(rolesRepository.deleteById).not.toHaveBeenCalled();
  });

  it('returns cached permissions when available', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify(['jobs.view']));

    const result = await service.listPermissions();

    expect(rolesRepository.getAllPermissions).not.toHaveBeenCalled();
    expect(result).toEqual(['jobs.view']);
  });

  it('returns internal server error when listRoles throws unexpectedly', async () => {
    rolesRepository.findAllByBusiness.mockRejectedValueOnce(new Error('boom'));

    const result = await service.listRoles(BUSINESS_ID);

    expect(result).toBeInstanceOf(InternalServerErrorException);
    expect((result as InternalServerErrorException).message).toBe(
      COMMON_MESSAGES.ERROR.INTERNAL,
    );
  });
});
