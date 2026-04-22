import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import {
  BusinessCategory,
  BusinessCategoryModel,
} from './schemas/business-category.schema';

@Injectable()
export class BusinessCategoriesRepository {
  private readonly model: ReturnModelType<typeof BusinessCategory> =
    BusinessCategoryModel;

  async findById(id: string): Promise<BusinessCategory | null> {
    return this.model.findById(id).lean<BusinessCategory>().exec();
  }

  async findAll(): Promise<BusinessCategory[]> {
    return this.model
      .find({ isActive: true })
      .lean<BusinessCategory[]>()
      .exec();
  }
}
