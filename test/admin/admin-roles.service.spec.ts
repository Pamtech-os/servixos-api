import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import * as hashUtil from 'src/common/utils/hash.util';
import { AdminRolesService } from 'src/modules/admin/services/admin-roles.service';
import { AdminRolesRepository } from 'src/modules/admin/repositories/admin-roles.repository';
import { AdminRepository } from 'src/modules/admin/repositories/admin.repository';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { asMock } from 'test/helpers/mock';

const ROLE_ID = new Types.ObjectId();
const ADMIN_ID = new Types.ObjectId();

const makeRole = (overrides: Record<string, unknown> = {}) => ({
  _id: ROLE_ID,
  name: 'Support',
  description: 'Support team',
  permissions: ['support.view'],
  isSystem: false,
  ...overrides,
});

const makeAdmin = (overrides: Record<string, unknown> = {}) => ({
  _id: ADMIN_ID,
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@admin.com',
  isActive: true,
  isDefault: false,
  ...overrides,
});

describe('AdminRolesService', () => {
  let service: AdminRolesService;
  let rolesRepo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByName: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    countMembersForRole: jest.Mock;
    assignRole: jest.Mock;
    getTeamMembers: jest.Mock;
    seedSystemRoles: jest.Mock;
  };
  let adminRepo: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
  };
  let agendaService: { now: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    rolesRepo = {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findByName: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(makeRole()),
      updateById: jest.fn().mockResolvedValue(makeRole()),
      deleteById: jest.fn().mockResolvedValue(undefined),
      countMembersForRole: jest.fn().mockResolvedValue(0),
      assignRole: jest.fn().mockResolvedValue(undefined),
      getTeamMembers: jest.fn().mockResolvedValue([]),
      seedSystemRoles: jest.fn().mockResolvedValue(undefined),
    };
    adminRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
    };
    agendaService = { now: jest.fn().mockResolvedValue(undefined) };
    config = { get: jest.fn().mockReturnValue('http://localhost:3000') };

    service = new AdminRolesService(
      asMock<AdminRolesRepository>(rolesRepo),
      asMock<AdminRepository>(adminRepo),
      asMock<AgendaService>(agendaService),
      asMock<ConfigService>(config),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── listRoles ──────────────────────────────────────────────────────────────

  describe('listRoles', () => {
    it('should return list from repository', async () => {
      // Arrange
      const roles = [makeRole()];
      rolesRepo.findAll.mockResolvedValue(roles);

      // Act
      const result = await service.listRoles();

      // Assert
      expect(result).toEqual(roles);
    });

    it('should return InternalServerErrorException on failure', async () => {
      // Arrange
      rolesRepo.findAll.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.listRoles();

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── listTeamMembers ────────────────────────────────────────────────────────

  describe('listTeamMembers', () => {
    it('should return team members list', async () => {
      // Arrange
      const members = [{ _id: ADMIN_ID, email: 'jane@admin.com' }];
      rolesRepo.getTeamMembers.mockResolvedValue(members);

      // Act
      const result = await service.listTeamMembers();

      // Assert
      expect(result).toEqual(members);
    });

    it('should return InternalServerErrorException on failure', async () => {
      // Arrange
      rolesRepo.getTeamMembers.mockRejectedValue(new Error('timeout'));

      // Act
      const result = await service.listTeamMembers();

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── createRole ─────────────────────────────────────────────────────────────

  describe('createRole', () => {
    it('should create a new role when name is unique', async () => {
      // Arrange
      rolesRepo.findByName.mockResolvedValue(null);
      const newRole = makeRole({ name: 'Billing' });
      rolesRepo.create.mockResolvedValue(newRole);

      // Act
      const result = await service.createRole({
        name: 'Billing',
        permissions: ['billing.view'],
      });

      // Assert
      expect(result).toEqual(newRole);
      expect(rolesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Billing', isSystem: false }),
      );
    });

    it('should return ConflictException when role name is already taken', async () => {
      // Arrange
      rolesRepo.findByName.mockResolvedValue(makeRole());

      // Act
      const result = await service.createRole({
        name: 'Support',
        permissions: [],
      });

      // Assert
      expect(result).toBeInstanceOf(ConflictException);
      expect(rolesRepo.create).not.toHaveBeenCalled();
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      rolesRepo.findByName.mockRejectedValue(new Error('crash'));

      // Act
      const result = await service.createRole({ name: 'X', permissions: [] });

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── updateRole ─────────────────────────────────────────────────────────────

  describe('updateRole', () => {
    it('should update the role when it exists and name is not taken', async () => {
      // Arrange
      rolesRepo.findById.mockResolvedValue(makeRole());
      rolesRepo.findByName.mockResolvedValue(null);
      const updated = makeRole({ name: 'Billing Updated' });
      rolesRepo.updateById.mockResolvedValue(updated);

      // Act
      const result = await service.updateRole(ROLE_ID.toString(), {
        name: 'Billing Updated',
        permissions: ['billing.view'],
      });

      // Assert
      expect(result).toEqual(updated);
    });

    it('should return NotFoundException when role does not exist', async () => {
      // Arrange
      rolesRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.updateRole('nonexistent', {
        name: 'X',
        permissions: [],
      });

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should return ConflictException when new name is taken by another role', async () => {
      // Arrange
      rolesRepo.findById.mockResolvedValue(makeRole({ name: 'Support' }));
      rolesRepo.findByName.mockResolvedValue(makeRole({ name: 'Billing' })); // different role same name

      // Act
      const result = await service.updateRole(ROLE_ID.toString(), {
        name: 'Billing',
        permissions: [],
      });

      // Assert
      expect(result).toBeInstanceOf(ConflictException);
    });

    it('should allow keeping the same name without conflict error', async () => {
      // Arrange — same name, no rename check triggered
      rolesRepo.findById.mockResolvedValue(makeRole({ name: 'Support' }));
      const updated = makeRole({ description: 'Updated description' });
      rolesRepo.updateById.mockResolvedValue(updated);

      // Act
      const result = await service.updateRole(ROLE_ID.toString(), {
        name: 'Support',
        permissions: ['support.view'],
      });

      // Assert — findByName should not be called since name didn't change
      expect(rolesRepo.findByName).not.toHaveBeenCalled();
      expect(result).toEqual(updated);
    });
  });

  // ─── deleteRole ─────────────────────────────────────────────────────────────

  describe('deleteRole', () => {
    it('should delete a custom role with no members', async () => {
      // Arrange
      rolesRepo.findById.mockResolvedValue(makeRole({ isSystem: false }));
      rolesRepo.countMembersForRole.mockResolvedValue(0);

      // Act
      const result = await service.deleteRole(ROLE_ID.toString());

      // Assert
      expect(result).toEqual({ deleted: true });
      expect(rolesRepo.deleteById).toHaveBeenCalledWith(ROLE_ID.toString());
    });

    it('should return NotFoundException when role does not exist', async () => {
      // Arrange
      rolesRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.deleteRole('unknown-id');

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect(rolesRepo.deleteById).not.toHaveBeenCalled();
    });

    it('should return ForbiddenException when deleting a system role', async () => {
      // Arrange
      rolesRepo.findById.mockResolvedValue(
        makeRole({ isSystem: true, name: 'Admin' }),
      );

      // Act
      const result = await service.deleteRole(ROLE_ID.toString());

      // Assert
      expect(result).toBeInstanceOf(ForbiddenException);
      expect(rolesRepo.deleteById).not.toHaveBeenCalled();
    });

    it('should return ForbiddenException when role still has members', async () => {
      // Arrange
      rolesRepo.findById.mockResolvedValue(makeRole({ isSystem: false }));
      rolesRepo.countMembersForRole.mockResolvedValue(3);

      // Act
      const result = await service.deleteRole(ROLE_ID.toString());

      // Assert
      expect(result).toBeInstanceOf(ForbiddenException);
      expect(rolesRepo.deleteById).not.toHaveBeenCalled();
    });
  });

  // ─── assignRole ─────────────────────────────────────────────────────────────

  describe('assignRole', () => {
    it('should assign a role to an admin', async () => {
      // Arrange
      adminRepo.findById.mockResolvedValue(makeAdmin());
      rolesRepo.findById.mockResolvedValue(makeRole({ name: 'Manager' }));

      // Act
      const result = await service.assignRole({
        adminId: ADMIN_ID.toString(),
        roleId: ROLE_ID.toString(),
      });

      // Assert
      expect(result).toEqual({
        adminId: ADMIN_ID.toString(),
        roleId: ROLE_ID.toString(),
        roleName: 'Manager',
      });
      expect(rolesRepo.assignRole).toHaveBeenCalledWith(
        ADMIN_ID.toString(),
        ROLE_ID.toString(),
      );
    });

    it('should return NotFoundException when admin is not found', async () => {
      // Arrange
      adminRepo.findById.mockResolvedValue(null);
      rolesRepo.findById.mockResolvedValue(makeRole());

      // Act
      const result = await service.assignRole({
        adminId: 'bad-id',
        roleId: ROLE_ID.toString(),
      });

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should return NotFoundException when role is not found', async () => {
      // Arrange
      adminRepo.findById.mockResolvedValue(makeAdmin());
      rolesRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.assignRole({
        adminId: ADMIN_ID.toString(),
        roleId: 'bad-role',
      });

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── inviteAdmin ─────────────────────────────────────────────────────────────

  describe('inviteAdmin', () => {
    it('should create an invited admin and queue invitation email when requested by the super admin', async () => {
      // Arrange
      adminRepo.findById.mockResolvedValue(makeAdmin({ isDefault: true }));
      adminRepo.findByEmail.mockResolvedValue(null);
      jest
        .spyOn(hashUtil, 'generateStrongPassword')
        .mockReturnValue('Tmp@1234!');
      jest.spyOn(hashUtil, 'hashValue').mockResolvedValue('hashed-password');

      // Act
      const result = await service.inviteAdmin(ADMIN_ID.toString(), {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@admin.com',
      });

      // Assert
      expect(result).toEqual({ invited: true });
      expect(adminRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'alice@admin.com',
          isInvited: true,
          mustChangePassword: true,
          passwordHash: 'hashed-password',
        }),
      );
      expect(agendaService.now).toHaveBeenCalledWith(
        expect.stringContaining('invitation'),
        expect.objectContaining({
          to: 'alice@admin.com',
          temporaryPassword: 'Tmp@1234!',
        }),
      );
    });

    it('should return ForbiddenException when the requesting admin is not the super admin', async () => {
      // Arrange
      adminRepo.findById.mockResolvedValue(makeAdmin({ isDefault: false }));

      // Act
      const result = await service.inviteAdmin(ADMIN_ID.toString(), {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@admin.com',
      });

      // Assert
      expect(result).toBeInstanceOf(ForbiddenException);
      expect(adminRepo.findByEmail).not.toHaveBeenCalled();
      expect(adminRepo.create).not.toHaveBeenCalled();
    });

    it('should return ForbiddenException when the requesting admin no longer exists', async () => {
      // Arrange
      adminRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.inviteAdmin(ADMIN_ID.toString(), {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@admin.com',
      });

      // Assert
      expect(result).toBeInstanceOf(ForbiddenException);
      expect(adminRepo.create).not.toHaveBeenCalled();
    });

    it('should return ConflictException when email is already registered', async () => {
      // Arrange
      adminRepo.findById.mockResolvedValue(makeAdmin({ isDefault: true }));
      adminRepo.findByEmail.mockResolvedValue(makeAdmin());

      // Act
      const result = await service.inviteAdmin(ADMIN_ID.toString(), {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'jane@admin.com',
      });

      // Assert
      expect(result).toBeInstanceOf(ConflictException);
      expect(adminRepo.create).not.toHaveBeenCalled();
    });

    it('should return NotFoundException when roleId does not exist', async () => {
      // Arrange
      adminRepo.findById.mockResolvedValue(makeAdmin({ isDefault: true }));
      adminRepo.findByEmail.mockResolvedValue(null);
      rolesRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.inviteAdmin(ADMIN_ID.toString(), {
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@admin.com',
        roleId: 'nonexistent-role',
      });

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should create admin without a role when roleId is omitted', async () => {
      // Arrange
      adminRepo.findById.mockResolvedValue(makeAdmin({ isDefault: true }));
      adminRepo.findByEmail.mockResolvedValue(null);
      jest
        .spyOn(hashUtil, 'generateStrongPassword')
        .mockReturnValue('Tmp@1234!');
      jest.spyOn(hashUtil, 'hashValue').mockResolvedValue('hashed-password');

      // Act
      const result = await service.inviteAdmin(ADMIN_ID.toString(), {
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@admin.com',
      });

      // Assert
      expect(result).toEqual({ invited: true });
      expect(rolesRepo.findById).not.toHaveBeenCalled();
    });
  });
});
