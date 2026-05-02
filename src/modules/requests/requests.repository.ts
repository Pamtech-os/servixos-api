import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { PaginationParams } from 'src/common/utils/pagination.util';
import {
  RequestStatus,
  ServiceRequest,
} from './schemas/service-request.schema';

interface ListFilters {
  status?: string;
  search?: string;
}

export interface RequestListStatistics {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  cancelled: number;
}

interface StatusAggregationResult {
  _id: RequestStatus;
  count: number;
}

@Injectable()
export class RequestsRepository {
  private readonly requestModel: ReturnModelType<typeof ServiceRequest>;

  constructor(@InjectConnection() connection: Connection) {
    this.requestModel = getModelForClass(ServiceRequest, {
      existingConnection: connection,
    });
  }

  async findAll(
    businessId: Types.ObjectId,
    filters: ListFilters,
    pagination: PaginationParams,
  ): Promise<{
    data: ServiceRequest[];
    total: number;
    statistics: RequestListStatistics;
  }> {
    const query: Record<string, unknown> = { businessId, deletedAt: null };
    const statisticsQuery: Record<string, unknown> = {
      businessId,
      deletedAt: null,
    };
    const searchFilter = this.buildSearchFilter(filters.search);

    if (filters.status) {
      query['status'] = filters.status;
    }

    if (searchFilter.length > 0) {
      query['$or'] = searchFilter;
      statisticsQuery['$or'] = searchFilter;
    }

    const [data, total, statisticsRows] = await Promise.all([
      this.requestModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<ServiceRequest[]>()
        .exec(),
      this.requestModel.countDocuments(query).exec(),
      this.requestModel
        .aggregate<StatusAggregationResult>([
          { $match: statisticsQuery },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const statistics: RequestListStatistics = {
      total: 0,
      pending: 0,
      accepted: 0,
      rejected: 0,
      cancelled: 0,
    };

    for (const row of statisticsRows) {
      statistics.total += row.count;

      if (row._id === RequestStatus.PENDING) statistics.pending = row.count;
      if (row._id === RequestStatus.ACCEPTED) statistics.accepted = row.count;
      if (row._id === RequestStatus.REJECTED) statistics.rejected = row.count;
      if (row._id === RequestStatus.CANCELLED) statistics.cancelled = row.count;
    }

    return { data, total, statistics };
  }

  private buildSearchFilter(search?: string): Array<Record<string, RegExp>> {
    if (!search) return [];

    const regex = new RegExp(search, 'i');
    return [{ clientName: regex }, { clientEmail: regex }, { service: regex }];
  }

  async findById(
    id: string,
    businessId: Types.ObjectId,
  ): Promise<ServiceRequest | null> {
    return this.requestModel
      .findOne({ _id: id, businessId, deletedAt: null })
      .lean<ServiceRequest>()
      .exec();
  }

  async create(
    data: Partial<ServiceRequest>,
    session?: ClientSession,
  ): Promise<ServiceRequest> {
    const [request] = await this.requestModel.create([data], { session });
    return request.toObject() as ServiceRequest;
  }

  async updateById(
    id: string | Types.ObjectId,
    businessId: Types.ObjectId,
    update: Partial<ServiceRequest>,
    session?: ClientSession,
  ): Promise<ServiceRequest | null> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};

    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) {
        $unset[key] = '';
      } else {
        $set[key] = value;
      }
    }

    const op: Record<string, unknown> = {};
    if (Object.keys($set).length) op['$set'] = $set;
    if (Object.keys($unset).length) op['$unset'] = $unset;

    return this.requestModel
      .findOneAndUpdate({ _id: id, businessId, deletedAt: null }, op, {
        returnDocument: 'after',
        session,
      })
      .lean<ServiceRequest>()
      .exec();
  }

  async softDelete(
    id: string,
    businessId: Types.ObjectId,
  ): Promise<ServiceRequest | null> {
    return this.requestModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean<ServiceRequest>()
      .exec();
  }
}
