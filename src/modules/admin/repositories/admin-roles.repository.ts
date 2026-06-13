import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { Admin } from '../schemas/admin.schema';
import { AdminRole } from '../schemas/admin-role.schema';
import type { AdminPermission } from 'src/common/constants/admin-permissions.constants';

export interface AdminRoleWithCount extends AdminRole {
  memberCount: number;
}

export interface AdminTeamMember {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  roleId?: Types.ObjectId;
  roleName?: string;
  lastLoginAt?: Date;
}

@Injectable()
export class AdminRolesRepository {
  private readonly roleModel: ReturnModelType<typeof AdminRole>;
  private readonly adminModel: ReturnModelType<typeof Admin>;

  constructor(@InjectConnection() connection: Connection) {
    this.roleModel = getModelForClass(AdminRole, {
      existingConnection: connection,
    });
    this.adminModel = getModelForClass(Admin, {
      existingConnection: connection,
    });
  }

  async findAll(): Promise<AdminRoleWithCount[]> {
    return this.roleModel
      .aggregate<AdminRoleWithCount>([
        {
          $lookup: {
            from: 'admins',
            localField: '_id',
            foreignField: 'roleId',
            as: 'members',
            pipeline: [
              { $match: { deletedAt: null } },
              { $project: { _id: 1 } },
            ],
          },
        },
        { $addFields: { memberCount: { $size: '$members' } } },
        { $project: { members: 0 } },
        { $sort: { createdAt: 1 } },
      ])
      .exec();
  }

  async findById(id: string): Promise<AdminRole | null> {
    return this.roleModel.findById(id).lean<AdminRole>().exec();
  }

  async findByName(name: string): Promise<AdminRole | null> {
    return this.roleModel
      .findOne({
        name: new RegExp(
          `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          'i',
        ),
      })
      .lean<AdminRole>()
      .exec();
  }

  async create(data: {
    name: string;
    description?: string;
    permissions: AdminPermission[];
    isSystem?: boolean;
  }): Promise<AdminRole> {
    const [doc] = await this.roleModel.create([data]);
    return doc.toObject() as AdminRole;
  }

  async updateById(
    id: string,
    update: {
      name?: string;
      description?: string;
      permissions?: AdminPermission[];
    },
  ): Promise<AdminRole | null> {
    return this.roleModel
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .lean<AdminRole>()
      .exec();
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.roleModel.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async countMembersForRole(roleId: string): Promise<number> {
    return this.adminModel
      .countDocuments({ roleId: new Types.ObjectId(roleId), deletedAt: null })
      .exec();
  }

  /** Assign a role to an admin — clears old roleId and sets new one. */
  async assignRole(adminId: string, roleId: string): Promise<Admin | null> {
    return this.adminModel
      .findByIdAndUpdate(
        adminId,
        { $set: { roleId: new Types.ObjectId(roleId) } },
        { returnDocument: 'after' },
      )
      .lean<Admin>()
      .exec();
  }

  async getTeamMembers(): Promise<AdminTeamMember[]> {
    return this.adminModel
      .aggregate<AdminTeamMember>([
        { $match: { deletedAt: null } },
        {
          $lookup: {
            from: 'admin_roles',
            localField: 'roleId',
            foreignField: '_id',
            as: 'role',
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $addFields: { roleName: { $arrayElemAt: ['$role.name', 0] } },
        },
        {
          $project: {
            passwordHash: 0,
            isDefault: 0,
            role: 0,
          },
        },
        { $sort: { createdAt: 1 } },
      ])
      .exec();
  }

  /** Seed default roles — used by AdminSeederService on startup. */
  async seedSystemRoles(
    roles: {
      name: string;
      description: string;
      permissions: AdminPermission[];
      isSystem: boolean;
    }[],
  ): Promise<AdminRole[]> {
    const seeded: AdminRole[] = [];
    for (const roleData of roles) {
      const existing = await this.findByName(roleData.name);
      if (!existing) {
        const created = await this.create(roleData);
        seeded.push(created);
      }
    }
    return seeded;
  }

  /** Find the role named "Admin" for use when assigning the default admin. */
  async findAdminRole(): Promise<AdminRole | null> {
    return this.roleModel
      .findOne({ name: 'Admin', isSystem: true })
      .lean<AdminRole>()
      .exec();
  }
}
