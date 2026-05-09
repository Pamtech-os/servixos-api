import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { ROLES_MESSAGES } from 'src/common/constants/messages/roles.messages';
import { RedisService } from '../../redis/services/redis.service';
import { UsersRepository } from '../../users/repositories/users.repository';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { RolesRepository } from '../repositories/roles.repository';
import {
  ALL_PERMISSIONS,
  DefaultRole,
  Permission,
  Role,
} from '../schemas/role.schema';

export type PublicRole = Omit<Role, 'isOwnerRole'>;

const rolesListCacheKey = (businessId: string): string =>
  `${businessId}:roles:list`;
const permissionsListCacheKey = 'permissions:all';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly rolesRepository: RolesRepository,
    private readonly redisService: RedisService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async listRoles(
    businessId: string,
  ): Promise<PublicRole[] | InternalServerErrorException> {
    try {
      const cacheKey = rolesListCacheKey(businessId);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as PublicRole[];
      }

      const roles = await this.rolesRepository.findAllByBusiness(
        new Types.ObjectId(businessId),
      );
      const sanitized = roles.map((role) => this.sanitizeRole(role));

      await this.redisService
        .set(cacheKey, JSON.stringify(sanitized), CACHE_TTL.ROLES_LIST)
        .catch((err: unknown) =>
          this.logger.warn(
            `listRoles: cache write failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return sanitized;
    } catch (error) {
      this.logger.error(
        `listRoles: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getRole(
    id: string,
    businessId: string,
  ): Promise<PublicRole | NotFoundException | InternalServerErrorException> {
    try {
      const role = await this.rolesRepository.findById(
        id,
        new Types.ObjectId(businessId),
      );

      if (!role) {
        this.logger.warn(
          `getRole: role not found [id=${id}, businessId=${businessId}]`,
        );
        return new NotFoundException(ROLES_MESSAGES.ERROR.NOT_FOUND);
      }

      return this.sanitizeRole(role);
    } catch (error) {
      this.logger.error(
        `getRole: unexpected error [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Creates a custom role for a business with an ACID transaction.
   *
   * Flow:
   *   1. Normalize and validate role name + permission strings.
   *   2. Check for duplicate role name within the same business.
   *   3. Insert role atomically in a MongoDB transaction.
   *   4. Invalidate roles list cache asynchronously.
   *
   * Example:
   *   POST /roles
   *   {
   *     "name": "Dispatcher",
   *     "permissions": ["dashboard.view", "jobs.view", "jobs.edit", "clients.view"]
   *   }
   */
  async createRole(
    businessId: string,
    dto: CreateRoleDto,
  ): Promise<
    | PublicRole
    | BadRequestException
    | ConflictException
    | InternalServerErrorException
  > {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const bId = new Types.ObjectId(businessId);
      const name = this.normalizeRoleName(dto.name);

      if (!name) {
        await session.abortTransaction();
        this.logger.warn(
          `createRole: empty role name rejected [businessId=${businessId}]`,
        );
        return new BadRequestException(ROLES_MESSAGES.VALIDATION.NAME_REQUIRED);
      }

      if (!this.hasOnlyValidPermissions(dto.permissions)) {
        await session.abortTransaction();
        this.logger.warn(
          `createRole: invalid permission payload rejected [businessId=${businessId}]`,
        );
        return new BadRequestException(ROLES_MESSAGES.ERROR.INVALID_PERMISSION);
      }

      const existing = await this.rolesRepository.findByBusinessAndName(
        bId,
        name,
      );

      if (existing) {
        await session.abortTransaction();
        this.logger.warn(
          `createRole: duplicate role name rejected [businessId=${businessId}, roleName=${name}]`,
        );
        return new ConflictException(ROLES_MESSAGES.ERROR.NAME_TAKEN);
      }

      const created = await this.rolesRepository.create(
        {
          businessId: bId,
          name,
          permissions: [...new Set(dto.permissions)] as Permission[],
          isSystem: false,
          isOwnerRole: false,
        },
        session,
      );

      await session.commitTransaction();
      void this.invalidateRolesListCache(businessId);

      return this.sanitizeRole(created);
    } catch (error) {
      await this.abortQuietly(session);

      if (this.isDuplicateKeyError(error)) {
        this.logger.warn(
          `createRole: duplicate key conflict [businessId=${businessId}]`,
        );
        return new ConflictException(ROLES_MESSAGES.ERROR.NAME_TAKEN);
      }

      this.logger.error(
        `createRole: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  async updateRole(
    id: string,
    businessId: string,
    dto: UpdateRoleDto,
  ): Promise<
    | PublicRole
    | BadRequestException
    | ConflictException
    | ForbiddenException
    | NotFoundException
    | InternalServerErrorException
  > {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.rolesRepository.findById(id, bId);

      if (!existing) {
        await session.abortTransaction();
        this.logger.warn(
          `updateRole: role not found [id=${id}, businessId=${businessId}]`,
        );
        return new NotFoundException(ROLES_MESSAGES.ERROR.NOT_FOUND);
      }

      if (this.isOwnerRole(existing) && dto.permissions !== undefined) {
        await session.abortTransaction();
        this.logger.warn(
          `updateRole: owner role permission change blocked [id=${id}, businessId=${businessId}]`,
        );
        return new ForbiddenException(
          ROLES_MESSAGES.ERROR.OWNER_ROLE_PERMISSIONS,
        );
      }

      const update: Partial<Role> = {};

      if (dto.name !== undefined) {
        const name = this.normalizeRoleName(dto.name);
        if (!name) {
          await session.abortTransaction();
          this.logger.warn(
            `updateRole: empty role name rejected [id=${id}, businessId=${businessId}]`,
          );
          return new BadRequestException(
            ROLES_MESSAGES.VALIDATION.NAME_REQUIRED,
          );
        }

        const duplicate = await this.rolesRepository.findByBusinessAndName(
          bId,
          name,
          id,
        );

        if (duplicate) {
          await session.abortTransaction();
          this.logger.warn(
            `updateRole: duplicate role name rejected [id=${id}, businessId=${businessId}, roleName=${name}]`,
          );
          return new ConflictException(ROLES_MESSAGES.ERROR.NAME_TAKEN);
        }

        update.name = name;
      }

      if (dto.permissions !== undefined) {
        if (!this.hasOnlyValidPermissions(dto.permissions)) {
          await session.abortTransaction();
          this.logger.warn(
            `updateRole: invalid permission payload rejected [id=${id}, businessId=${businessId}]`,
          );
          return new BadRequestException(
            ROLES_MESSAGES.ERROR.INVALID_PERMISSION,
          );
        }
        update.permissions = [...new Set(dto.permissions)] as Permission[];
      }

      const updated = await this.rolesRepository.updateById(
        id,
        bId,
        update,
        session,
      );

      if (!updated) {
        await session.abortTransaction();
        this.logger.warn(
          `updateRole: role missing at update commit stage [id=${id}, businessId=${businessId}]`,
        );
        return new NotFoundException(ROLES_MESSAGES.ERROR.NOT_FOUND);
      }

      await session.commitTransaction();
      void this.invalidateRolesListCache(businessId);

      return this.sanitizeRole(updated);
    } catch (error) {
      await this.abortQuietly(session);

      if (this.isDuplicateKeyError(error)) {
        this.logger.warn(
          `updateRole: duplicate key conflict [id=${id}, businessId=${businessId}]`,
        );
        return new ConflictException(ROLES_MESSAGES.ERROR.NAME_TAKEN);
      }

      this.logger.error(
        `updateRole: unexpected error [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  async deleteRole(
    id: string,
    businessId: string,
  ): Promise<
    | null
    | ConflictException
    | ForbiddenException
    | NotFoundException
    | InternalServerErrorException
  > {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.rolesRepository.findById(id, bId);

      if (!existing) {
        await session.abortTransaction();
        this.logger.warn(
          `deleteRole: role not found [id=${id}, businessId=${businessId}]`,
        );
        return new NotFoundException(ROLES_MESSAGES.ERROR.NOT_FOUND);
      }

      if (this.isSystemRole(existing)) {
        await session.abortTransaction();
        this.logger.warn(
          `deleteRole: system role deletion blocked [id=${id}, businessId=${businessId}]`,
        );
        return new ForbiddenException(ROLES_MESSAGES.ERROR.DEFAULT_ROLE);
      }

      const attachedUsersCount = await this.usersRepository.countByRoleId(
        bId,
        existing._id,
        session,
      );
      if (attachedUsersCount > 0) {
        await session.abortTransaction();
        this.logger.warn(
          `deleteRole: role-in-use deletion blocked [id=${id}, businessId=${businessId}, attachedUsers=${attachedUsersCount}]`,
        );
        return new ConflictException(ROLES_MESSAGES.ERROR.ROLE_IN_USE);
      }

      const deleted = await this.rolesRepository.deleteById(id, bId, session);
      if (!deleted) {
        await session.abortTransaction();
        this.logger.warn(
          `deleteRole: role missing at delete commit stage [id=${id}, businessId=${businessId}]`,
        );
        return new NotFoundException(ROLES_MESSAGES.ERROR.NOT_FOUND);
      }

      await session.commitTransaction();
      void this.invalidateRolesListCache(businessId);

      return null;
    } catch (error) {
      await this.abortQuietly(session);
      this.logger.error(
        `deleteRole: unexpected error [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  async listPermissions(): Promise<string[] | InternalServerErrorException> {
    try {
      const cached = await this.redisService.get(permissionsListCacheKey);
      if (cached) {
        return JSON.parse(cached) as string[];
      }

      const permissions = [...this.rolesRepository.getAllPermissions()];

      await this.redisService
        .set(
          permissionsListCacheKey,
          JSON.stringify(permissions),
          CACHE_TTL.PERMISSIONS_LIST,
        )
        .catch((err: unknown) =>
          this.logger.warn(
            `listPermissions: cache write failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return permissions;
    } catch (error) {
      this.logger.error(
        `listPermissions: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private isSystemRole(role: Role): boolean {
    return Boolean(role.isSystem);
  }

  private isOwnerRole(role: Role): boolean {
    const roleWithLegacy = role as Role & { isOwnerRole?: boolean };
    if (roleWithLegacy.isOwnerRole) return true;

    return (
      this.isSystemRole(role) &&
      role.name.trim().toLowerCase() === DefaultRole.OWNER.toLowerCase()
    );
  }

  private sanitizeRole(role: Role): PublicRole {
    const roleWithInternalMarker = role as Role & { isOwnerRole?: boolean };
    const { isOwnerRole: _isOwnerRole, ...rest } = roleWithInternalMarker;
    return rest;
  }

  private normalizeRoleName(name: string): string {
    return name.replace(/\s+/g, ' ').trim();
  }

  private hasOnlyValidPermissions(permissions: string[]): boolean {
    const valid = new Set<string>(ALL_PERMISSIONS);
    return permissions.every((permission) => valid.has(permission));
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return Boolean(
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000,
    );
  }

  private async invalidateRolesListCache(businessId: string): Promise<void> {
    await this.redisService
      .del(rolesListCacheKey(businessId))
      .catch((err: unknown) =>
        this.logger.warn(
          `invalidateRolesListCache: cache delete failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  private async abortQuietly(session: ClientSession): Promise<void> {
    try {
      await session.abortTransaction();
    } catch {
      // no-op: avoid masking the original error path
    }
  }
}
