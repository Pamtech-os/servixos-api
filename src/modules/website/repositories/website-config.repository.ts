import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { WebsiteConfig } from '../schemas/website-config.schema';

@Injectable()
export class WebsiteConfigRepository {
  private readonly model: ReturnModelType<typeof WebsiteConfig>;

  constructor(@InjectConnection() connection: Connection) {
    this.model = getModelForClass(WebsiteConfig, {
      existingConnection: connection,
    });
  }

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
        { returnDocument: 'after' },
      )
      .lean<WebsiteConfig>()
      .exec();
  }
}
