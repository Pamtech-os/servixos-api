import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { Business, BusinessModel } from './schemas/business.schema';

@Injectable()
export class BusinessRepository {
  private readonly businessModel: ReturnModelType<typeof Business> =
    BusinessModel;
}
