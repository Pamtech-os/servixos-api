import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { JOBS } from 'src/common/constants/agenda.constants';
import { generateStrongPassword, hashValue } from 'src/common/utils/hash.util';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { AdminRolesRepository } from '../repositories/admin-roles.repository';
import { AdminRepository } from '../repositories/admin.repository';
import {
  CreateRoleDto,
  UpdateRoleDto,
  AssignRoleDto,
} from '../dto/create-role.dto';
import type { InviteAdminDto } from '../dto/invite-admin.dto';
import type { AdminInvitationJobData } from 'src/modules/agenda/jobs/email.jobs';

@Injectable()
export class AdminRolesService {
  private readonly logger = new Logger(AdminRolesService.name);

  private readonly appUrl: string;

  constructor(
    private readonly rolesRepo: AdminRolesRepository,
    private readonly adminRepo: AdminRepository,
    private readonly agendaService: AgendaService,
    private readonly config: ConfigService,
  ) {
    this.appUrl = this.config.get<string>('APP_URL') || 'http://localhost:3000';
  }

  /** List all roles with member counts. */
  async listRoles() {
    try {
      return await this.rolesRepo.findAll();
    } catch (error) {
      this.logger.error(
        `listRoles: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** List all admin team members with their current role. */
  async listTeamMembers() {
    try {
      return await this.rolesRepo.getTeamMembers();
    } catch (error) {
      this.logger.error(
        `listTeamMembers: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Create a new custom role. */
  async createRole(dto: CreateRoleDto) {
    try {
      const existing = await this.rolesRepo.findByName(dto.name);
      if (existing)
        return new ConflictException(ADMIN_MESSAGES.ERROR.ROLE_NAME_TAKEN);

      return await this.rolesRepo.create({
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
        isSystem: false,
      });
    } catch (error) {
      if (error instanceof ConflictException) return error;
      this.logger.error(
        `createRole: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Update a role's name, description, or permissions. */
  async updateRole(id: string, dto: UpdateRoleDto) {
    try {
      const role = await this.rolesRepo.findById(id);
      if (!role)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.ROLE_NOT_FOUND);

      if (dto.name && dto.name !== role.name) {
        const nameTaken = await this.rolesRepo.findByName(dto.name);
        if (nameTaken)
          return new ConflictException(ADMIN_MESSAGES.ERROR.ROLE_NAME_TAKEN);
      }

      return await this.rolesRepo.updateById(id, {
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      )
        return error;
      this.logger.error(
        `updateRole: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Delete a role — blocked for system roles and roles with active members. */
  async deleteRole(id: string) {
    try {
      const role = await this.rolesRepo.findById(id);
      if (!role)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.ROLE_NOT_FOUND);
      if (role.isSystem)
        return new ForbiddenException(ADMIN_MESSAGES.ERROR.ROLE_SYSTEM_DELETE);

      const memberCount = await this.rolesRepo.countMembersForRole(id);
      if (memberCount > 0)
        return new ForbiddenException(ADMIN_MESSAGES.ERROR.ROLE_HAS_MEMBERS);

      await this.rolesRepo.deleteById(id);
      return { deleted: true };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        return error;
      this.logger.error(
        `deleteRole: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Invite a new admin team member — creates account and sends invitation email. */
  async inviteAdmin(dto: InviteAdminDto) {
    try {
      const existing = await this.adminRepo.findByEmail(dto.email);
      if (existing)
        return new ConflictException(
          ADMIN_MESSAGES.ERROR.ADMIN_INVITE_EMAIL_TAKEN,
        );

      let roleId: import('mongoose').Types.ObjectId | undefined;
      if (dto.roleId) {
        const role = await this.rolesRepo.findById(dto.roleId);
        if (!role)
          return new NotFoundException(ADMIN_MESSAGES.ERROR.ROLE_NOT_FOUND);
        roleId = role._id;
      }

      const tempPassword = generateStrongPassword();
      const passwordHash = await hashValue(tempPassword);

      await this.adminRepo.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash,
        isActive: true,
        isDefault: false,
        isInvited: true,
        mustChangePassword: true,
        ...(roleId ? { roleId } : {}),
      });

      await this.agendaService.now<AdminInvitationJobData>(
        JOBS.EMAIL_ADMIN_INVITATION,
        {
          to: dto.email,
          firstName: dto.firstName,
          temporaryPassword: tempPassword,
          loginUrl: `${this.appUrl}/admin/login`,
        },
      );

      return { invited: true };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      )
        return error;
      this.logger.error(
        `inviteAdmin: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Assign a role to an admin team member. */
  async assignRole(dto: AssignRoleDto) {
    try {
      const [admin, role] = await Promise.all([
        this.adminRepo.findById(dto.adminId),
        this.rolesRepo.findById(dto.roleId),
      ]);

      if (!admin)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.USER_NOT_FOUND);
      if (!role)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.ROLE_NOT_FOUND);

      await this.rolesRepo.assignRole(dto.adminId, dto.roleId);
      return { adminId: dto.adminId, roleId: dto.roleId, roleName: role.name };
    } catch (error) {
      if (error instanceof NotFoundException) return error;
      this.logger.error(
        `assignRole: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }
}
