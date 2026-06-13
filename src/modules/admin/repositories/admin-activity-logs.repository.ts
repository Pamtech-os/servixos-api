import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, PipelineStage, Types } from 'mongoose';
import { ActivityLog } from '../../activity-logs/schemas/activity-log.schema';
import { User } from '../../users/schemas/user.schema';
import { PaginationParams } from 'src/common/utils/pagination.util';

export interface AdminActivityLogItem {
  _id: Types.ObjectId;
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

  constructor(@InjectConnection() connection: Connection) {
    this.activityLogModel = getModelForClass(ActivityLog, {
      existingConnection: connection,
    });
    this.userModel = getModelForClass(User, { existingConnection: connection });
  }

  async findAll(
    filters: ActivityLogsFilters,
    pagination: PaginationParams,
  ): Promise<{ data: AdminActivityLogItem[]; total: number }> {
    const matchStage = this.buildMatchStage(filters);

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
        $addFields: {
          actorEmail: { $arrayElemAt: ['$actor.email', 0] },
        },
      },
      {
        $project: { actor: 0, ipAddress: 0, userAgent: 0, city: 0, country: 0 },
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

  private buildMatchStage(
    filters: ActivityLogsFilters,
  ): Record<string, unknown> {
    const match: Record<string, unknown> = {};

    if (filters.search) {
      const regex = new RegExp(
        filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      match['$or'] = [
        { actorName: regex },
        { action: regex },
        { target: regex },
      ];
    }

    if (filters.actorRole) {
      match['actorRole'] = filters.actorRole;
    }

    return match;
  }
}
