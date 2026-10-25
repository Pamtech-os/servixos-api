import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, PipelineStage, Types } from 'mongoose';
import { ActivityLog } from '../../activity-logs/schemas/activity-log.schema';
import { User } from '../../users/schemas/user.schema';
import { Business } from '../../business/schemas/business.schema';
import { PaginationParams } from 'src/common/utils/pagination.util';

export interface AdminActivityLogItem {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  businessName?: string;
  actorName: string;
  actorEmail?: string;
  actorRole: string;
  action: string;
  category: string;
  target?: string;
  createdAt: Date;
}

interface ActivityLogsFilters {
  search?: string;
  actorRole?: string;
}

@Injectable()
export class AdminActivityLogsRepository {
  private readonly activityLogModel: ReturnModelType<typeof ActivityLog>;
  private readonly userModel: ReturnModelType<typeof User>;
  private readonly businessModel: ReturnModelType<typeof Business>;

  constructor(@InjectConnection() connection: Connection) {
    this.activityLogModel = getModelForClass(ActivityLog, {
      existingConnection: connection,
    });
    this.userModel = getModelForClass(User, { existingConnection: connection });
    this.businessModel = getModelForClass(Business, {
      existingConnection: connection,
    });
  }

  async findAll(
    filters: ActivityLogsFilters,
    pagination: PaginationParams,
  ): Promise<{ data: AdminActivityLogItem[]; total: number }> {
    const matchStage = await this.buildMatchStage(filters);

    const pipeline: PipelineStage[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'actorId',
          foreignField: '_id',
          as: 'actor',
          pipeline: [{ $project: { email: 1 } }],
        },
      },
      {
        $lookup: {
          from: 'businesses',
          localField: 'businessId',
          foreignField: '_id',
          as: 'business',
          pipeline: [{ $project: { name: 1 } }],
        },
      },
      {
        $addFields: {
          actorEmail: { $arrayElemAt: ['$actor.email', 0] },
          businessName: { $arrayElemAt: ['$business.name', 0] },
        },
      },
      {
        $project: {
          actor: 0,
          business: 0,
          ipAddress: 0,
          userAgent: 0,
          city: 0,
          country: 0,
        },
      },
    ];

    const [countResult, data] = await Promise.all([
      this.activityLogModel
        .aggregate<{ total: number }>([...pipeline, { $count: 'total' }])
        .exec(),
      this.activityLogModel
        .aggregate<AdminActivityLogItem>([
          ...pipeline,
          { $sort: { createdAt: -1 } },
          { $skip: pagination.skip },
          { $limit: pagination.limit },
        ])
        .exec(),
    ]);

    return { data, total: countResult[0]?.total ?? 0 };
  }

  private async buildMatchStage(
    filters: ActivityLogsFilters,
  ): Promise<Record<string, unknown>> {
    const match: Record<string, unknown> = {};

    if (filters.search) {
      const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');

      // Pre-query users matching email or individual name parts for actorId filter
      const matchingActorIds = await this.userModel
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

      // Pre-query businesses matching name for businessId filter
      const matchingBusinessIds = await this.businessModel
        .find({ name: regex, deletedAt: null })
        .distinct('_id')
        .exec();

      match['$or'] = [
        { actorName: regex }, // full name stored directly — covers first/last/full name
        { action: regex },
        { target: regex },
        { actorId: { $in: matchingActorIds } }, // email + individual name parts
        { businessId: { $in: matchingBusinessIds } },
      ];
    }

    if (filters.actorRole) {
      match['actorRole'] = filters.actorRole;
    }

    return match;
  }
}
