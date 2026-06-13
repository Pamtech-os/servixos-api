import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { Business } from '../schemas/business.schema';

@Injectable()
export class BusinessRepository {
  private readonly businessModel: ReturnModelType<typeof Business>;

  constructor(@InjectConnection() connection: Connection) {
    this.businessModel = getModelForClass(Business, {
      existingConnection: connection,
    });
  }

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

  async findBySubdomain(subdomain: string): Promise<Business | null> {
    return this.businessModel
      .findOne({ subdomain, deletedAt: null })
      .lean<Business>()
      .exec();
  }

  async findAllTimezones(): Promise<
    Array<{ _id: Types.ObjectId; timezone: string }>
  > {
    return this.businessModel
      .find({ deletedAt: null }, { _id: 1, timezone: 1 })
      .lean<Array<{ _id: Types.ObjectId; timezone: string }>>()
      .exec();
  }

  async findByName(name: string): Promise<Business | null> {
    return this.businessModel
      .findOne({
        name: new RegExp(
          `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          'i',
        ),
        deletedAt: null,
      })
      .lean<Business>()
      .exec();
  }

  async findSubdomainsStartingWith(base: string): Promise<string[]> {
    const docs = await this.businessModel
      .find(
        { subdomain: { $regex: `^${base}(-\\d+)?$` }, deletedAt: null },
        { subdomain: 1, _id: 0 },
      )
      .lean<{ subdomain?: string }[]>()
      .exec();
    return docs.map((d) => d.subdomain).filter((s): s is string => !!s);
  }
}
