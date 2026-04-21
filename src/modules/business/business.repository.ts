import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { Business, BusinessModel } from './schemas/business.schema';

@Injectable()
export class BusinessRepository {
  private readonly businessModel: ReturnModelType<typeof Business> =
    BusinessModel;

  async findById(id: string): Promise<Business | null> {
    return this.businessModel.findById(id).lean<Business>().exec();
  }
}
