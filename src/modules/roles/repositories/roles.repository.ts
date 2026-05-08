import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import {
  DefaultRole,
  DEFAULT_ROLE_PERMISSIONS,
  Role,
} from '../schemas/role.schema';

@Injectable()
export class RolesRepository {
  private readonly roleModel: ReturnModelType<typeof Role>;

  constructor(@InjectConnection() connection: Connection) {
    this.roleModel = getModelForClass(Role, { existingConnection: connection });
  }

  async findById(id: string): Promise<Role | null> {
    return this.roleModel.findById(id).lean<Role>().exec();
  }

  async findByBusinessAndName(
    businessId: string,
    name: string,
  ): Promise<Role | null> {
    return this.roleModel
      .findOne({ businessId: new Types.ObjectId(businessId), name })
      .lean<Role>()
      .exec();
  }

  async createDefaultRoles(
    businessId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ owner: Role; manager: Role; employee: Role }> {
    const roles = await this.roleModel.create(
      [
        {
          businessId,
          name: DefaultRole.OWNER,
          permissions: DEFAULT_ROLE_PERMISSIONS[DefaultRole.OWNER],
          isSystem: true,
        },
        {
          businessId,
          name: DefaultRole.MANAGER,
          permissions: DEFAULT_ROLE_PERMISSIONS[DefaultRole.MANAGER],
          isSystem: true,
        },
        {
          businessId,
          name: DefaultRole.EMPLOYEE,
          permissions: DEFAULT_ROLE_PERMISSIONS[DefaultRole.EMPLOYEE],
          isSystem: true,
        },
      ],
      { session, ordered: true },
    );

    return {
      owner: roles[0].toObject() as Role,
      manager: roles[1].toObject() as Role,
      employee: roles[2].toObject() as Role,
    };
  }
}
