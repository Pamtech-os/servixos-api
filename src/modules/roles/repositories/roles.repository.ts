import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { escapeRegex } from 'src/common/utils/regex.util';
import {
  ALL_PERMISSIONS,
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

  async findAllByBusiness(businessId: Types.ObjectId): Promise<Role[]> {
    return this.roleModel
      .find({ businessId })
      .sort({ isSystem: -1, name: 1 })
      .lean<Role[]>()
      .exec();
  }

  async findById(
    id: string,
    businessId?: Types.ObjectId,
  ): Promise<Role | null> {
    const query: Record<string, unknown> = { _id: id };
    if (businessId) query['businessId'] = businessId;

    return this.roleModel.findOne(query).lean<Role>().exec();
  }

  async findByBusinessAndName(
    businessId: Types.ObjectId,
    name: string,
    excludeId?: string,
  ): Promise<Role | null> {
    const query: Record<string, unknown> = {
      businessId,
      name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
    };

    if (excludeId) {
      query['_id'] = { $ne: new Types.ObjectId(excludeId) };
    }

    return this.roleModel.findOne(query).lean<Role>().exec();
  }

  async create(data: Partial<Role>, session?: ClientSession): Promise<Role> {
    const [role] = await this.roleModel.create([data], { session });
    return role.toObject() as Role;
  }

  async updateById(
    id: string,
    businessId: Types.ObjectId,
    update: Partial<Role>,
    session?: ClientSession,
  ): Promise<Role | null> {
    const $set: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        $set[key] = value;
      }
    }

    if (Object.keys($set).length === 0) {
      return this.findById(id, businessId);
    }

    return this.roleModel
      .findOneAndUpdate(
        { _id: id, businessId },
        { $set },
        { returnDocument: 'after', session },
      )
      .lean<Role>()
      .exec();
  }

  async deleteById(
    id: string,
    businessId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Role | null> {
    return this.roleModel
      .findOneAndDelete({ _id: id, businessId }, { session })
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
          isOwnerRole: true,
        },
        {
          businessId,
          name: DefaultRole.MANAGER,
          permissions: DEFAULT_ROLE_PERMISSIONS[DefaultRole.MANAGER],
          isSystem: true,
          isOwnerRole: false,
        },
        {
          businessId,
          name: DefaultRole.EMPLOYEE,
          permissions: DEFAULT_ROLE_PERMISSIONS[DefaultRole.EMPLOYEE],
          isSystem: true,
          isOwnerRole: false,
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

  getAllPermissions(): readonly string[] {
    return ALL_PERMISSIONS;
  }
}
