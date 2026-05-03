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
