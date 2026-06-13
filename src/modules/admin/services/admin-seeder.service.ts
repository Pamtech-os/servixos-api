import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashValue } from 'src/common/utils/hash.util';
import {
  ALL_ADMIN_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from 'src/common/constants/admin-permissions.constants';
import { AdminRepository } from '../repositories/admin.repository';
import { AdminRolesRepository } from '../repositories/admin-roles.repository';

const DEFAULT_ADMIN_EMAIL = 'admin@servixos.com';
const DEFAULT_ADMIN_PASSWORD_ENV = 'ADMIN_DEFAULT_PASSWORD';

@Injectable()
export class AdminSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeederService.name);

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly rolesRepository: AdminRolesRepository,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedDefaultRoles();
    await this.seedDefaultAdmin();
  }

  private async seedDefaultRoles(): Promise<void> {
    try {
      const roleDefs = [
        {
          name: 'Admin',
          description: 'Full platform access with all permissions',
          permissions: ALL_ADMIN_PERMISSIONS,
          isSystem: true,
        },
        {
          name: 'Manager',
          description: 'Business and user management without system settings',
          permissions: [...DEFAULT_ROLE_PERMISSIONS.Manager],
          isSystem: false,
        },
        {
          name: 'Support',
          description: 'View-only access with limited user management',
          permissions: [...DEFAULT_ROLE_PERMISSIONS.Support],
          isSystem: false,
        },
        {
          name: 'Billing',
          description: 'Full billing access with view-only user access',
          permissions: [...DEFAULT_ROLE_PERMISSIONS.Billing],
          isSystem: false,
        },
      ];

      await this.rolesRepository.seedSystemRoles(roleDefs);
      this.logger.log('Admin roles seeded');
    } catch (error) {
      this.logger.error(
        `seedDefaultRoles: failed: ${error instanceof Error ? error.stack : String(error)}`,
      );
    }
  }

  private async seedDefaultAdmin(): Promise<void> {
    try {
      const existing = await this.adminRepository.findDefault();
      if (existing) {
        this.logger.log('Default admin already exists — skipping seed');
        return;
      }

      const rawPassword = this.config.get<string>(DEFAULT_ADMIN_PASSWORD_ENV);
      if (!rawPassword) {
        this.logger.error(
          `${DEFAULT_ADMIN_PASSWORD_ENV} is not set — cannot seed default admin`,
        );
        return;
      }

      const passwordHash = await hashValue(rawPassword);
      const adminRole = await this.rolesRepository.findAdminRole();

      await this.adminRepository.create({
        firstName: 'Super',
        lastName: 'Admin',
        email: DEFAULT_ADMIN_EMAIL,
        passwordHash,
        isActive: true,
        isDefault: true,
        mustChangePassword: true,
        isInvited: false,
        ...(adminRole ? { roleId: adminRole._id } : {}),
      });

      this.logger.log(`Default admin seeded [email=${DEFAULT_ADMIN_EMAIL}]`);
    } catch (error) {
      this.logger.error(
        `seedDefaultAdmin: failed: ${error instanceof Error ? error.stack : String(error)}`,
      );
    }
  }
}
