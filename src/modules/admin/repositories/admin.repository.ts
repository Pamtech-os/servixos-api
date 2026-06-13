import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection } from 'mongoose';
import { Admin } from '../schemas/admin.schema';

@Injectable()
export class AdminRepository {
  private readonly adminModel: ReturnModelType<typeof Admin>;

  constructor(@InjectConnection() connection: Connection) {
    this.adminModel = getModelForClass(Admin, {
      existingConnection: connection,
    });
  }

  async findByEmail(email: string): Promise<Admin | null> {
    return this.adminModel
      .findOne({ email, deletedAt: null })
      .lean<Admin>()
      .exec();
  }

  async findById(id: string): Promise<Admin | null> {
    return this.adminModel.findById(id).lean<Admin>().exec();
  }

  async findDefault(): Promise<Admin | null> {
    return this.adminModel
      .findOne({ isDefault: true, deletedAt: null })
      .lean<Admin>()
      .exec();
  }

  async create(data: Partial<Admin>): Promise<Admin> {
    const [admin] = await this.adminModel.create([data]);
    return admin.toObject() as Admin;
  }

  async updateById(id: string, update: Partial<Admin>): Promise<Admin | null> {
    return this.adminModel
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .lean<Admin>()
      .exec();
  }
}
