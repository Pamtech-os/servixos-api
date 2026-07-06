import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { Job, JobStatus } from '../schemas/job.schema';

interface ListJobsFilters {
  search?: string;
  clientId?: string;
  status?: JobStatus;
}

type PopulatedClient = {
  _id: Types.ObjectId;
  name: string;
  email: string;
};

type JobWithMetadata = Job & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
  clientId: Types.ObjectId | PopulatedClient;
};

@Injectable()
export class JobsRepository {
  private readonly jobModel: ReturnModelType<typeof Job>;

  constructor(@InjectConnection() connection: Connection) {
    this.jobModel = getModelForClass(Job, { existingConnection: connection });
  }

  async findAll(
    businessId: Types.ObjectId,
    filters: ListJobsFilters,
    pagination: PaginationParams,
  ): Promise<{ data: Job[]; total: number }> {
    const query: Record<string, unknown> = { businessId, deletedAt: null };

    if (filters.search) {
      query['title'] = { $regex: new RegExp(filters.search, 'i') };
    }

    if (filters.clientId) {
      query['clientId'] = new Types.ObjectId(filters.clientId);
    }

    if (filters.status) {
      query['status'] = filters.status;
    }

    const [data, total] = await Promise.all([
      this.jobModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<JobWithMetadata[]>()
        .exec(),
      this.jobModel.countDocuments(query).exec(),
    ]);

    return { data: this.sanitizeJobs(data), total };
  }

  async findById(
    id: string,
    businessId: Types.ObjectId,
    populateClient = false,
  ): Promise<Job | null> {
    const query = this.jobModel.findOne({
      _id: id,
      businessId,
      deletedAt: null,
    });

    if (populateClient) {
      query.populate({ path: 'clientId', select: 'name email' });
    }

    const job = await query.lean<JobWithMetadata>().exec();
    return this.sanitizeJob(job);
  }

  async findByIdForClient(
    id: string,
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<Job | null> {
    const job = await this.jobModel
      .findOne({
        _id: id,
        businessId,
        clientId,
        deletedAt: null,
      })
      .lean<JobWithMetadata>()
      .exec();

    return this.sanitizeJob(job);
  }

  async findBySourceRequestId(
    businessId: Types.ObjectId,
    sourceRequestId: Types.ObjectId,
  ): Promise<Job | null> {
    const job = await this.jobModel
      .findOne({ businessId, sourceRequestId, deletedAt: null })
      .lean<JobWithMetadata>()
      .exec();
    return this.sanitizeJob(job);
  }

  async create(data: Partial<Job>, session?: ClientSession): Promise<Job> {
    const payload: Partial<Job> = { ...data };
    if (payload.sourceRequestId == null) {
      delete payload.sourceRequestId;
    }

    const [job] = await this.jobModel.create([payload], { session });
    return this.sanitizeJob(job.toObject() as JobWithMetadata) as Job;
  }

  async updateById(
    id: string | Types.ObjectId,
    businessId: Types.ObjectId,
    update: Partial<Job>,
    session?: ClientSession,
  ): Promise<Job | null> {
    const op = this.buildUpdateOperator(update);

    const updated = await this.jobModel
      .findOneAndUpdate({ _id: id, businessId, deletedAt: null }, op, {
        returnDocument: 'after',
        session,
      })
      .lean<JobWithMetadata>()
      .exec();

    return this.sanitizeJob(updated);
  }

  async transitionStatusById(
    id: string,
    businessId: Types.ObjectId,
    expectedStatuses: JobStatus[],
    update: Partial<Job>,
    session?: ClientSession,
  ): Promise<Job | null> {
    const op = this.buildUpdateOperator(update);

    const transitioned = await this.jobModel
      .findOneAndUpdate(
        {
          _id: id,
          businessId,
          deletedAt: null,
          status: { $in: expectedStatuses },
        },
        op,
        {
          returnDocument: 'after',
          session,
        },
      )
      .lean<JobWithMetadata>()
      .exec();

    return this.sanitizeJob(transitioned);
  }

  async softDelete(
    id: string,
    businessId: Types.ObjectId,
  ): Promise<Job | null> {
    const deleted = await this.jobModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean<JobWithMetadata>()
      .exec();

    return this.sanitizeJob(deleted);
  }

  async softDeleteMany(
    ids: string[],
    businessId: Types.ObjectId,
  ): Promise<number> {
    const objectIds = ids.map((id) => new Types.ObjectId(id));

    const res = await this.jobModel.updateMany(
      { _id: { $in: objectIds }, businessId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    );

    return res.modifiedCount;
  }

  async findByIds(
    ids: Types.ObjectId[],
    businessId: Types.ObjectId,
  ): Promise<Job[]> {
    if (ids.length === 0) return [];

    const jobs = await this.jobModel
      .find({
        _id: { $in: ids },
        businessId,
        deletedAt: null,
      })
      .lean<JobWithMetadata[]>()
      .exec();

    return this.sanitizeJobs(jobs);
  }

  private sanitizeJobs(jobs: JobWithMetadata[]): Job[] {
    return jobs.map((job) => this.sanitizeJob(job)!);
  }

  private buildUpdateOperator(update: Partial<Job>): Record<string, unknown> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};

    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) {
        $unset[key] = '';
      } else {
        $set[key] = value;
      }
    }

    const op: Record<string, unknown> = {};
    if (Object.keys($set).length) op['$set'] = $set;
    if (Object.keys($unset).length) op['$unset'] = $unset;

    return op;
  }

  private sanitizeJob(job: JobWithMetadata | null): Job | null {
    if (!job) return null;

    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      __v: _version,
      ...safeJob
    } = job;

    return safeJob as Job;
  }
}
