import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { CACHE_TTL } from '../constants/cache-ttl.constants';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { JwtUser } from '../decorators/current-user.decorator';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { RolesRepository } from 'src/modules/roles/repositories/roles.repository';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { UserRole } from 'src/modules/users/schemas/user.schema';
import { ALL_PERMISSIONS } from '../constants/permissions.constants';

type UserWithPermissions = JwtUser & { permissions?: string[] };

const rolePermissionsCacheKey = (businessId: string, roleId: string): string =>
  `${businessId}:roles:${roleId}:permissions`;

@Injectable()
export class PermissionsContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permission metadata means no hydration work for this request.
    if (!required || required.length === 0) {
      return true;
    }

    const req = context
      .switchToHttp()
      .getRequest<{ user?: UserWithPermissions }>();
    const user = req.user;
    if (!user) return true;

    // Business owners always operate with the full permission set.
    if (user.userRole === UserRole.OWNER) {
      user.permissions = [...ALL_PERMISSIONS];
      return true;
    }

    if (Array.isArray(user.permissions)) {
      return true;
    }

    const dbUser = await this.usersRepository.findById(user.sub);
    if (
      !dbUser ||
      dbUser.deletedAt ||
      !dbUser.roleId ||
      !dbUser.businessId ||
      dbUser.businessId.toString() !== user.businessId
    ) {
      user.permissions = [];
      return true;
    }

    const roleId = dbUser.roleId.toString();
    const cacheKey = rolePermissionsCacheKey(user.businessId, roleId);
    const cachedPermissions = await this.redisService.get(cacheKey);
    if (cachedPermissions) {
      user.permissions = JSON.parse(cachedPermissions) as string[];
      return true;
    }

    const role = await this.rolesRepository.findById(
      roleId,
      new Types.ObjectId(user.businessId),
    );
    const permissions = role?.permissions ?? [];
    user.permissions = permissions;

    await this.redisService
      .set(cacheKey, JSON.stringify(permissions), CACHE_TTL.PERMISSIONS_LIST)
      .catch(() => undefined);

    return true;
  }
}
