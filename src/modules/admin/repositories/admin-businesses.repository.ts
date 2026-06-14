import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, PipelineStage, Types } from 'mongoose';
import {
  Business,
  SubscriptionStatus,
} from '../../business/schemas/business.schema';
import { User } from '../../users/schemas/user.schema';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { AdminBusinessStatus } from '../dto/query-businesses.dto';

export interface AdminBusinessListItem {
  _id: Types.ObjectId;
  name: string;
  subdomain?: string;
  categoryName: string;
  subscription: {
    plan: string;
    status: string;
  };
  isSuspended: boolean;
  createdAt: Date;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerId: Types.ObjectId;
}

export interface AdminBusinessDetail extends AdminBusinessListItem {
  description?: string;
  email?: string;
  phone?: string;
  address?: string;
  timezone: string;
}

interface BusinessListFilters {
  search?: string;
  status?: AdminBusinessStatus;
}

@Injectable()
export class AdminBusinessesRepository {
  private readonly businessModel: ReturnModelType<typeof Business>;
  private readonly userModel: ReturnModelType<typeof User>;

  constructor(@InjectConnection() connection: Connection) {
    this.businessModel = getModelForClass(Business, {
      existingConnection: connection,
    });
    this.userModel = getModelForClass(User, { existingConnection: connection });
  }

  async findAll(
    filters: BusinessListFilters,
    pagination: PaginationParams,
  ): Promise<{ data: AdminBusinessListItem[]; total: number }> {
    const matchStage = await this.buildMatchStage(filters);

    const pipeline: PipelineStage[] = [
      { $match: { deletedAt: null, ...matchStage } },
      {
        $lookup: {
          from: 'users',
          localField: 'ownerId',
          foreignField: '_id',
          as: 'owner',
          pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1 } }],
        },
      },
      {
        $addFields: {
          ownerFirstName: { $arrayElemAt: ['$owner.firstName', 0] },
          ownerLastName: { $arrayElemAt: ['$owner.lastName', 0] },
          ownerEmail: { $arrayElemAt: ['$owner.email', 0] },
        },
      },
      { $project: { owner: 0, colors: 0, services: 0, notifications: 0 } },
    ];

    const [countResult, data] = await Promise.all([
      this.businessModel
        .aggregate<{ total: number }>([...pipeline, { $count: 'total' }])
        .exec(),
      this.businessModel
        .aggregate<AdminBusinessListItem>([
          ...pipeline,
          { $sort: { createdAt: -1 } },
          { $skip: pagination.skip },
          { $limit: pagination.limit },
        ])
        .exec(),
    ]);

    return { data, total: countResult[0]?.total ?? 0 };
  }

  async findByIdWithOwner(id: string): Promise<AdminBusinessDetail | null> {
    const results = await this.businessModel
      .aggregate<AdminBusinessDetail>([
        { $match: { _id: new Types.ObjectId(id), deletedAt: null } },
        {
          $lookup: {
            from: 'users',
            localField: 'ownerId',
            foreignField: '_id',
            as: 'owner',
            pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1 } }],
          },
        },
        {
          $addFields: {
            ownerFirstName: { $arrayElemAt: ['$owner.firstName', 0] },
            ownerLastName: { $arrayElemAt: ['$owner.lastName', 0] },
            ownerEmail: { $arrayElemAt: ['$owner.email', 0] },
          },
        },
        { $project: { owner: 0 } },
      ])
      .exec();

    return results[0] ?? null;
  }

  async findManyByIds(
    ids: string[],
  ): Promise<(Business & { ownerEmail?: string; ownerFirstName?: string })[]> {
    return this.businessModel
      .aggregate<Business & { ownerEmail?: string; ownerFirstName?: string }>([
        {
          $match: {
            _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
            deletedAt: null,
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'ownerId',
            foreignField: '_id',
            as: 'owner',
            pipeline: [{ $project: { firstName: 1, email: 1 } }],
          },
        },
        {
          $addFields: {
            ownerEmail: { $arrayElemAt: ['$owner.email', 0] },
            ownerFirstName: { $arrayElemAt: ['$owner.firstName', 0] },
          },
        },
        { $project: { owner: 0 } },
      ])
      .exec();
  }

  async updateById(
    id: string,
    update: Partial<Business>,
  ): Promise<Business | null> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    for (const [key, val] of Object.entries(update)) {
      if (val === undefined) $unset[key] = '';
      else $set[key] = val;
    }
    const query: Record<string, unknown> = {};
    if (Object.keys($set).length) query['$set'] = $set;
    if (Object.keys($unset).length) query['$unset'] = $unset;

    return this.businessModel
      .findByIdAndUpdate(id, query, { returnDocument: 'after' })
      .lean<Business>()
      .exec();
  }

  async updateManyByIds(
    ids: string[],
    update: Partial<Business>,
  ): Promise<number> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    for (const [key, val] of Object.entries(update)) {
      if (val === undefined) $unset[key] = '';
      else $set[key] = val;
    }
    const query: Record<string, unknown> = {};
    if (Object.keys($set).length) query['$set'] = $set;
    if (Object.keys($unset).length) query['$unset'] = $unset;

    const result = await this.businessModel.updateMany(
      {
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        deletedAt: null,
      },
      query,
    );
    return result.modifiedCount;
  }

  /** Deactivate all users belonging to these businesses (except CLIENT role). */
  async deactivateAllStaff(businessIds: string[]): Promise<void> {
    await this.userModel.updateMany(
      {
        businessId: { $in: businessIds.map((id) => new Types.ObjectId(id)) },
        deletedAt: null,
      },
      { $set: { isActive: false } },
    );
  }

  /** Reactivate all users belonging to these businesses (restores isActive). */
  async reactivateAllStaff(businessIds: string[]): Promise<void> {
    await this.userModel.updateMany(
      {
        businessId: { $in: businessIds.map((id) => new Types.ObjectId(id)) },
        deletedAt: null,
      },
      { $set: { isActive: true } },
    );
  }

  private async buildMatchStage(
    filters: BusinessListFilters,
  ): Promise<Record<string, unknown>> {
    const match: Record<string, unknown> = {};

    if (filters.search) {
      const regex = new RegExp(filters.search, 'i');
      // Find owner IDs matching email, first name, last name, or full name
      const ownerIds = await this.userModel
        .find({
          $or: [
            { email: regex },
            { firstName: regex },
            { lastName: regex },
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ['$firstName', ' ', '$lastName'] },
                  regex: filters.search,
                  options: 'i',
                },
              },
            },
          ],
        })
        .distinct('_id')
        .exec();

      match['$or'] = [
        { name: regex },
        { subdomain: regex },
        { ownerId: { $in: ownerIds } },
      ];
    }

    if (filters.status && filters.status !== AdminBusinessStatus.ALL) {
      switch (filters.status) {
        case AdminBusinessStatus.ACTIVE:
          match['isSuspended'] = false;
          match['subscription.status'] = {
            $in: [
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.TRIALING,
              SubscriptionStatus.GRACE_PERIOD,
            ],
          };
          break;
        case AdminBusinessStatus.SUSPENDED:
          match['isSuspended'] = true;
          break;
        case AdminBusinessStatus.PENDING:
          match['isSuspended'] = false;
          match['subscription.status'] = {
            $in: [SubscriptionStatus.LOCKED, SubscriptionStatus.CANCELED],
          };
          break;
      }
    }

    return match;
  }
}
