import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { Client } from './schemas/client.schema';

@Injectable()
export class ClientsRepository {
  private readonly clientModel: ReturnModelType<typeof Client>;

  constructor(@InjectConnection() connection: Connection) {
    this.clientModel = getModelForClass(Client, {
      existingConnection: connection,
    });
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

  async create(
    data: Partial<Client>,
    session?: ClientSession,
  ): Promise<Client> {
    const [client] = await this.clientModel.create([data], { session });
    return client.toObject() as Client;
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
