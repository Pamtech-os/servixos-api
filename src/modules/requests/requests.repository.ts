import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { ServiceRequest } from './schemas/service-request.schema';

interface ListFilters {
  status?: string;
  search?: string;
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
  ): Promise<{ data: ServiceRequest[]; total: number }> {
    const query: Record<string, unknown> = { businessId, deletedAt: null };

    if (filters.status) {
      query['status'] = filters.status;
    }

    if (filters.search) {
      const regex = new RegExp(filters.search, 'i');
      query['$or'] = [
        { clientName: regex },
        { clientEmail: regex },
        { service: regex },
      ];
    }

    const [data, total] = await Promise.all([
      this.requestModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<ServiceRequest[]>()
        .exec(),
      this.requestModel.countDocuments(query).exec(),
    ]);

    return { data, total };
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
