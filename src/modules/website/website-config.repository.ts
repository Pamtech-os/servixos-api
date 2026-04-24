import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Types } from 'mongoose';
import {
  WebsiteConfig,
  WebsiteConfigModel,
} from './schemas/website-config.schema';

@Injectable()
export class WebsiteConfigRepository {
  private readonly model: ReturnModelType<typeof WebsiteConfig> =
    WebsiteConfigModel;

  async create(
    data: Partial<WebsiteConfig>,
    session?: ClientSession,
  ): Promise<WebsiteConfig> {
    const [config] = await this.model.create([data], { session });
    return config.toObject() as WebsiteConfig;
  }

  async findByBusinessId(businessId: string): Promise<WebsiteConfig | null> {
    return this.model
      .findOne({ businessId: new Types.ObjectId(businessId) })
      .lean<WebsiteConfig>()
      .exec();
  }

  async updateByBusinessId(
    businessId: string,
    update: Partial<WebsiteConfig>,
  ): Promise<WebsiteConfig | null> {
    return this.model
      .findOneAndUpdate(
        { businessId: new Types.ObjectId(businessId) },
        { $set: update },
        { new: true },
      )
      .lean<WebsiteConfig>()
      .exec();
  }
}
