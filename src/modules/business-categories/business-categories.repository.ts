import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection } from 'mongoose';
import { BusinessCategory } from './schemas/business-category.schema';

@Injectable()
export class BusinessCategoriesRepository {
  private readonly model: ReturnModelType<typeof BusinessCategory>;

  constructor(@InjectConnection() connection: Connection) {
    this.model = getModelForClass(BusinessCategory, {
      existingConnection: connection,
    });
  }

  async findById(id: string): Promise<BusinessCategory | null> {
    return this.model.findById(id).lean<BusinessCategory>().exec();
  }

  async findAll(): Promise<BusinessCategory[]> {
    return this.model
      .find({ isActive: true }, { _id: 1, name: 1, slug: 1 })
      .lean<BusinessCategory[]>()
      .exec();
  }
}
