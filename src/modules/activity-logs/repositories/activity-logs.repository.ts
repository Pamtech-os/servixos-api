import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { ActivityLog, LogCategory } from '../schemas/activity-log.schema';

export interface ListActivityLogsFilters {
  search?: string;
  category?: LogCategory;
  dateFrom?: Date;
  dateTo?: Date;
}

@Injectable()
export class ActivityLogsRepository {
  private readonly activityLogModel: ReturnModelType<typeof ActivityLog>;

  constructor(@InjectConnection() connection: Connection) {
    this.activityLogModel = getModelForClass(ActivityLog, {
      existingConnection: connection,
    });
  }

  async create(data: Partial<ActivityLog>): Promise<ActivityLog> {
    const [log] = await this.activityLogModel.create([data]);
    return log.toObject() as ActivityLog;
  }

  async findAll(
    businessId: Types.ObjectId,
    filters: ListActivityLogsFilters,
    pagination: PaginationParams,
  ): Promise<{ data: ActivityLog[]; total: number }> {
    const query: Record<string, unknown> = { businessId };

    if (filters.search) {
      /*
       * Full-text filter across actor name and action description.
       * Example: search="Jane" matches "Jane Smith" or "Updated Jane's profile"
       */
      query['$or'] = [
        { actorName: { $regex: new RegExp(filters.search, 'i') } },
        { action: { $regex: new RegExp(filters.search, 'i') } },
      ];
    }

    if (filters.category) {
      query['category'] = filters.category;
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateRange: Record<string, Date> = {};
      if (filters.dateFrom) dateRange['$gte'] = filters.dateFrom;
      if (filters.dateTo) dateRange['$lte'] = filters.dateTo;
      query['timestamp'] = dateRange;
    }

    const [data, total] = await Promise.all([
      this.activityLogModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<ActivityLog[]>()
        .exec(),
      this.activityLogModel.countDocuments(query).exec(),
    ]);

    return { data, total };
  }
}
