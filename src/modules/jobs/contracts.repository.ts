import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { Contract } from './schemas/contract.schema';

type ContractWithMetadata = Contract & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
};

@Injectable()
export class ContractsRepository {
  private readonly contractModel: ReturnModelType<typeof Contract>;

  constructor(@InjectConnection() connection: Connection) {
    this.contractModel = getModelForClass(Contract, {
      existingConnection: connection,
    });
  }

  async findById(
    id: string,
    businessId: Types.ObjectId,
  ): Promise<Contract | null> {
    const contract = await this.contractModel
      .findOne({ _id: id, businessId, deletedAt: null })
      .lean<ContractWithMetadata>()
      .exec();

    return this.sanitizeContract(contract);
  }

  async findByJobId(
    jobId: Types.ObjectId,
    businessId: Types.ObjectId,
  ): Promise<Contract | null> {
    const contract = await this.contractModel
      .findOne({ jobId, businessId, deletedAt: null })
      .lean<ContractWithMetadata>()
      .exec();

    return this.sanitizeContract(contract);
  }

  async upsertByJobId(
    jobId: Types.ObjectId,
    businessId: Types.ObjectId,
    update: Partial<Contract>,
    session?: ClientSession,
  ): Promise<Contract> {
    const contract = await this.contractModel
      .findOneAndUpdate(
        { jobId, businessId },
        { $set: { ...update, deletedAt: null } },
        { upsert: true, returnDocument: 'after', session },
      )
      .lean<ContractWithMetadata>()
      .exec();

    if (!contract) {
      throw new Error('Failed to upsert contract');
    }

    return this.sanitizeContract(contract) as Contract;
  }

  async updateById(
    id: string,
    businessId: Types.ObjectId,
    update: Partial<Contract>,
    session?: ClientSession,
  ): Promise<Contract | null> {
    const updated = await this.contractModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set: update },
        { returnDocument: 'after', session },
      )
      .lean<ContractWithMetadata>()
      .exec();

    return this.sanitizeContract(updated);
  }

  private sanitizeContract(
    contract: ContractWithMetadata | null,
  ): Contract | null {
    if (!contract) return null;

    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      __v: _version,
      ...safeContract
    } = contract;

    return safeContract as Contract;
  }
}
