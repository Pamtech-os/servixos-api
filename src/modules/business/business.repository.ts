import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { ClientSession } from 'mongoose';
import { Business, BusinessModel } from './schemas/business.schema';

@Injectable()
export class BusinessRepository {
  private readonly businessModel: ReturnModelType<typeof Business> =
    BusinessModel;

  async findById(id: string): Promise<Business | null> {
    return this.businessModel.findById(id).lean<Business>().exec();
  }

  async create(
    data: Partial<Business>,
    session?: ClientSession,
  ): Promise<Business> {
    const [business] = await this.businessModel.create([data], { session });
    return business.toObject() as Business;
  }
}
