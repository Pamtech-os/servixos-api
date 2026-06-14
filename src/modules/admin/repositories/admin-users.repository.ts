import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, PipelineStage, Types } from 'mongoose';
import { User, UserRole } from '../../users/schemas/user.schema';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { AdminUserStatus, AdminUserRole } from '../dto/query-users.dto';

export interface AdminUserListItem {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  userRole: string;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  businessName?: string;
  businessId?: Types.ObjectId;
}

export interface AdminUserDetail extends AdminUserListItem {
  phone?: string;
}

export interface AdminUserStats {
  totalUsers: number;
  activeUsers: number;
  businessOwners: number;
  teamMembers: number;
  clients: number;
}

interface UserListFilters {
  search?: string;
  status?: AdminUserStatus;
  role?: AdminUserRole;
}

@Injectable()
export class AdminUsersRepository {
  private readonly userModel: ReturnModelType<typeof User>;

  constructor(@InjectConnection() connection: Connection) {
    this.userModel = getModelForClass(User, { existingConnection: connection });
  }

  async findAll(
    filters: UserListFilters,
    pagination: PaginationParams,
  ): Promise<{ data: AdminUserListItem[]; total: number }> {
    const match = this.buildMatchStage(filters);

    const pipeline: PipelineStage[] = [
      { $match: { deletedAt: null, ...match } },
      {
        $lookup: {
          from: 'businesses',
          localField: 'businessId',
          foreignField: '_id',
          as: 'business',
          pipeline: [
            { $match: { deletedAt: null } },
            { $project: { name: 1 } },
          ],
        },
      },
      {
        $addFields: {
          businessName: { $arrayElemAt: ['$business.name', 0] },
        },
      },
      { $project: { passwordHash: 0, pinHash: 0, business: 0 } },
    ];

    const [countResult, data] = await Promise.all([
      this.userModel
        .aggregate<{ total: number }>([...pipeline, { $count: 'total' }])
        .exec(),
      this.userModel
        .aggregate<AdminUserListItem>([
          ...pipeline,
          { $sort: { createdAt: -1 } },
          { $skip: pagination.skip },
          { $limit: pagination.limit },
        ])
        .exec(),
    ]);

    return { data, total: countResult[0]?.total ?? 0 };
  }

  async findByIdWithBusiness(id: string): Promise<AdminUserDetail | null> {
    const results = await this.userModel
      .aggregate<AdminUserDetail>([
        { $match: { _id: new Types.ObjectId(id), deletedAt: null } },
        {
          $lookup: {
            from: 'businesses',
            localField: 'businessId',
            foreignField: '_id',
            as: 'business',
            pipeline: [
              { $match: { deletedAt: null } },
              { $project: { name: 1 } },
            ],
          },
        },
        {
          $addFields: {
            businessName: { $arrayElemAt: ['$business.name', 0] },
          },
        },
        { $project: { passwordHash: 0, pinHash: 0, business: 0 } },
      ])
      .exec();

    return results[0] ?? null;
  }

  async findManyByIds(
    ids: string[],
  ): Promise<
    Pick<User, '_id' | 'firstName' | 'lastName' | 'email' | 'isActive'>[]
  > {
    return this.userModel
      .find(
        {
          _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
          deletedAt: null,
        },
        { firstName: 1, lastName: 1, email: 1, isActive: 1 },
      )
      .lean<
        Pick<User, '_id' | 'firstName' | 'lastName' | 'email' | 'isActive'>[]
      >()
      .exec();
  }

  async updateById(id: string, update: Partial<User>): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .lean<User>()
      .exec();
  }

  async updateManyByIds(ids: string[], update: Partial<User>): Promise<number> {
    const result = await this.userModel.updateMany(
      {
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        deletedAt: null,
      },
      { $set: update },
    );
    return result.modifiedCount;
  }

  async getStats(): Promise<AdminUserStats> {
    interface FacetResult {
      total: { count: number }[];
      active: { count: number }[];
      owners: { count: number }[];
      team: { count: number }[];
      clients: { count: number }[];
    }

    const results = await this.userModel
      .aggregate<FacetResult>([
        { $match: { deletedAt: null } },
        {
          $facet: {
            total: [{ $count: 'count' }],
            active: [{ $match: { isActive: true } }, { $count: 'count' }],
            owners: [
              { $match: { userRole: UserRole.OWNER } },
              { $count: 'count' },
            ],
            team: [
              {
                $match: {
                  userRole: { $in: [UserRole.EMPLOYEE, UserRole.STAFF] },
                },
              },
              { $count: 'count' },
            ],
            clients: [
              { $match: { userRole: UserRole.CLIENT } },
              { $count: 'count' },
            ],
          },
        },
      ])
      .exec();

    const r = results[0];

    return {
      totalUsers: r.total[0]?.count ?? 0,
      activeUsers: r.active[0]?.count ?? 0,
      businessOwners: r.owners[0]?.count ?? 0,
      teamMembers: r.team[0]?.count ?? 0,
      clients: r.clients[0]?.count ?? 0,
    };
  }

  private buildMatchStage(filters: UserListFilters): Record<string, unknown> {
    const match: Record<string, unknown> = {};

    if (filters.search) {
      // Regex search across firstName, lastName, email — O(n) scan, acceptable for admin
      const regex = new RegExp(filters.search, 'i');
      match['$or'] = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
      ];
    }

    if (filters.status && filters.status !== AdminUserStatus.ALL) {
      switch (filters.status) {
        case AdminUserStatus.ACTIVE:
          match['isActive'] = true;
          match['isEmailVerified'] = true;
          break;
        case AdminUserStatus.SUSPENDED:
          match['isActive'] = false;
          match['isEmailVerified'] = true;
          break;
        case AdminUserStatus.PENDING:
          match['isEmailVerified'] = false;
          break;
      }
    }

    if (filters.role && filters.role !== AdminUserRole.ALL) {
      match['userRole'] = filters.role;
    }

    return match;
  }
}
