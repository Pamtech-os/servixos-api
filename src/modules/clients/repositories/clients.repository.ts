import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { Client } from '../schemas/client.schema';

export interface ListClientsFilters {
  search?: string;
}

@Injectable()
export class ClientsRepository {
  private readonly clientModel: ReturnModelType<typeof Client>;

  constructor(@InjectConnection() connection: Connection) {
    this.clientModel = getModelForClass(Client, {
      existingConnection: connection,
    });
  }

  async findAll(
    businessId: Types.ObjectId,
    filters: ListClientsFilters,
    pagination: PaginationParams,
  ): Promise<{ data: Client[]; total: number }> {
    const query: Record<string, unknown> = { businessId, deletedAt: null };

    if (filters.search) {
      /*
       * Full-text search across name and email fields.
       * Example: search="john" matches "John Smith" or "john@example.com"
       */
      query['$or'] = [
        { name: { $regex: new RegExp(filters.search, 'i') } },
        { email: { $regex: new RegExp(filters.search, 'i') } },
      ];
    }

    const [data, total] = await Promise.all([
      this.clientModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<Client[]>()
        .exec(),
      this.clientModel.countDocuments(query).exec(),
    ]);

    return { data, total };
  }

  async findByEmail(
    email: string,
    businessId: Types.ObjectId,
  ): Promise<Client | null> {
    return this.clientModel
      .findOne({ email, businessId, deletedAt: null })
      .lean<Client>()
      .exec();
  }

  async findById(
    id: string,
    businessId: Types.ObjectId,
  ): Promise<Client | null> {
    return this.clientModel
      .findOne({ _id: id, businessId, deletedAt: null })
      .lean<Client>()
      .exec();
  }

  async findByUserId(
    userId: Types.ObjectId,
    businessId: Types.ObjectId,
  ): Promise<Client | null> {
    return this.clientModel
      .findOne({ userId, businessId, deletedAt: null })
      .lean<Client>()
      .exec();
  }

  async create(
    data: Partial<Client>,
    session?: ClientSession,
  ): Promise<Client> {
    const [client] = await this.clientModel.create([data], { session });
    return client.toObject() as Client;
  }

  async updateById(
    id: string,
    businessId: Types.ObjectId,
    update: Partial<Client>,
    session?: ClientSession,
  ): Promise<Client | null> {
    return this.clientModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set: update },
        { returnDocument: 'after', session },
      )
      .lean<Client>()
      .exec();
  }

  async softDelete(
    id: string,
    businessId: Types.ObjectId,
  ): Promise<Client | null> {
    return this.clientModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean<Client>()
      .exec();
  }

  async upsertFromRequest(
    data: {
      businessId: Types.ObjectId;
      name: string;
      email: string;
      phone?: string;
      userId?: Types.ObjectId;
    },
    session?: ClientSession,
  ): Promise<Client> {
    const $set: Record<string, unknown> = {
      businessId: data.businessId,
      name: data.name,
      email: data.email,
      deletedAt: null,
    };

    if (data.phone !== undefined) $set.phone = data.phone;
    if (data.userId) $set.userId = data.userId;

    const client = await this.clientModel
      .findOneAndUpdate(
        { businessId: data.businessId, email: data.email },
        { $set },
        { upsert: true, returnDocument: 'after', session },
      )
      .lean<Client>()
      .exec();

    if (!client) {
      throw new Error('Failed to upsert client from request payload');
    }

    return client;
  }

  async setBalance(
    id: Types.ObjectId,
    businessId: Types.ObjectId,
    balance: number,
    session?: ClientSession,
  ): Promise<void> {
    await this.clientModel.updateOne(
      { _id: id, businessId, deletedAt: null },
      { $set: { balance } },
      { session },
    );
  }

  async attachUserIdIfMissing(
    email: string,
    businessId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<void> {
    await this.clientModel.updateOne(
      { email, businessId, deletedAt: null, userId: { $exists: false } },
      { $set: { userId } },
    );
  }
}
