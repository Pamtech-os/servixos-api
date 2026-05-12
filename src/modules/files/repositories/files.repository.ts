import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { ClientFile } from '../schemas/client-file.schema';

@Injectable()
export class FilesRepository {
  private readonly clientFileModel: ReturnModelType<typeof ClientFile>;

  constructor(@InjectConnection() connection: Connection) {
    this.clientFileModel = getModelForClass(ClientFile, {
      existingConnection: connection,
    });
  }

  async findAllForClient(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<ClientFile[]> {
    return this.clientFileModel
      .find({ businessId, clientId, deletedAt: null })
      .sort({ createdAt: -1 })
      .lean<ClientFile[]>()
      .exec();
  }

  async findById(
    id: string,
    businessId: Types.ObjectId,
  ): Promise<ClientFile | null> {
    return this.clientFileModel
      .findOne({ _id: id, businessId, deletedAt: null })
      .lean<ClientFile>()
      .exec();
  }

  async create(
    data: Partial<ClientFile>,
    session?: ClientSession,
  ): Promise<ClientFile> {
    const [created] = await this.clientFileModel.create([data], { session });
    return created.toObject() as ClientFile;
  }

  async softDelete(
    id: string,
    businessId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<ClientFile | null> {
    return this.clientFileModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { returnDocument: 'after', session },
      )
      .lean<ClientFile>()
      .exec();
  }
}
