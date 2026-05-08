import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { Contract, ContractStatus } from '../schemas/contract.schema';

type ContractWithMetadata = Contract & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
};

interface ClientContractsFilters {
  status?: ContractStatus;
  sentBefore?: Date;
}

interface ContractsAggregateResult {
  data: Array<ContractWithMetadata & { job?: unknown; __jobPrice?: number }>;
  total: number;
}

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

  async findByIdForClient(
    id: string,
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<Contract | null> {
    const contract = await this.contractModel
      .findOne({
        _id: id,
        businessId,
        clientId,
        deletedAt: null,
      })
      .lean<ContractWithMetadata>()
      .exec();

    return this.sanitizeContract(contract);
  }

  async findAllForClient(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
    filters: ClientContractsFilters,
    pagination: { skip: number; limit: number },
    sort: Record<string, 1 | -1>,
  ): Promise<{ data: Contract[]; total: number }> {
    const query: Record<string, unknown> = {
      businessId,
      clientId,
      deletedAt: null,
    };

    if (filters.status) {
      query['status'] = filters.status;
    }

    if (filters.sentBefore) {
      query['sentAt'] = { $lt: filters.sentBefore };
    }

    const [data, total] = await Promise.all([
      this.contractModel
        .find(query)
        .sort(sort)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<ContractWithMetadata[]>()
        .exec(),
      this.contractModel.countDocuments(query).exec(),
    ]);

    return { data: data.map((row) => this.sanitizeContract(row)!), total };
  }

  async findAllForClientSortedByJobAmount(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
    filters: ClientContractsFilters,
    pagination: { skip: number; limit: number },
    direction: 1 | -1,
  ): Promise<{ data: Contract[]; total: number }> {
    const query: Record<string, unknown> = {
      businessId,
      clientId,
      deletedAt: null,
    };

    if (filters.status) {
      query['status'] = filters.status;
    }

    if (filters.sentBefore) {
      query['sentAt'] = { $lt: filters.sentBefore };
    }

    const [result] = await this.contractModel
      .aggregate<ContractsAggregateResult>([
        { $match: query },
        {
          $lookup: {
            from: 'jobs',
            localField: 'jobId',
            foreignField: '_id',
            as: 'job',
          },
        },
        {
          $addFields: {
            __jobPrice: {
              $ifNull: [{ $first: '$job.price' }, 0],
            },
          },
        },
        {
          $sort: {
            __jobPrice: direction,
            createdAt: -1,
          },
        },
        {
          $facet: {
            data: [{ $skip: pagination.skip }, { $limit: pagination.limit }],
            total: [{ $count: 'count' }],
          },
        },
        {
          $project: {
            data: 1,
            total: {
              $ifNull: [{ $arrayElemAt: ['$total.count', 0] }, 0],
            },
          },
        },
      ])
      .exec();

    const rows = result?.data ?? [];
    return {
      data: rows.map((row) => this.sanitizeContract(row)!).filter(Boolean),
      total: result?.total ?? 0,
    };
  }

  async countForClient(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
    status: ContractStatus,
  ): Promise<number> {
    return this.contractModel
      .countDocuments({
        businessId,
        clientId,
        status,
        deletedAt: null,
      })
      .exec();
  }

  async signContractForClient(
    id: string,
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
    signedAt: Date,
  ): Promise<Contract | null> {
    const signed = await this.contractModel
      .findOneAndUpdate(
        {
          _id: id,
          businessId,
          clientId,
          deletedAt: null,
          status: ContractStatus.SENT,
        },
        {
          $set: {
            status: ContractStatus.SIGNED,
            signedAt,
          },
        },
        {
          returnDocument: 'after',
        },
      )
      .lean<ContractWithMetadata>()
      .exec();

    return this.sanitizeContract(signed);
  }

  async findPdfFilesForClient(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
    limit = 200,
  ): Promise<Contract[]> {
    const rows = await this.contractModel
      .find({
        businessId,
        clientId,
        deletedAt: null,
        pdfUrl: { $exists: true, $ne: null },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<ContractWithMetadata[]>()
      .exec();

    return rows.map((row) => this.sanitizeContract(row)!);
  }

  private sanitizeContract(
    contract: ContractWithMetadata | null,
  ): Contract | null {
    if (!contract) return null;

    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      __v: _version,
      job: _job,
      __jobPrice: _jobPrice,
      ...safeContract
    } = contract as ContractWithMetadata & {
      job?: unknown;
      __jobPrice?: number;
    };

    return safeContract as Contract;
  }
}
