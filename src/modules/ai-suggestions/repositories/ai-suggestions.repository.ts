import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { Client } from '../../clients/schemas/client.schema';
import { Invoice, InvoiceStatus } from '../../invoices/schemas/invoice.schema';
import { Job, JobStatus } from '../../jobs/schemas/job.schema';
import type { IdleClient } from '../types/ai-suggestions.types';

/**
 * Read/write repository for the AI Suggestions module.
 *
 * Same self-contained-model pattern as AnalyticsRepository/AiInsightsRepository
 * for reads. Unlike those read-only repositories, this one also performs the
 * bounded, deterministic mutations behind each suggestion's "Apply" action —
 * there is no external precondition (like a signed contract) that could make
 * these calls fail, by design, so Apply is always safe to trigger with one click.
 */
@Injectable()
export class AiSuggestionsRepository {
  private readonly clientModel: ReturnModelType<typeof Client>;
  private readonly jobModel: ReturnModelType<typeof Job>;
  private readonly invoiceModel: ReturnModelType<typeof Invoice>;

  constructor(@InjectConnection() connection: Connection) {
    this.clientModel = getModelForClass(Client, {
      existingConnection: connection,
    });
    this.jobModel = getModelForClass(Job, { existingConnection: connection });
    this.invoiceModel = getModelForClass(Invoice, {
      existingConnection: connection,
    });
  }

  /**
   * Returns clients whose most recently completed job finished before
   * `thresholdDate` with no newer job since — i.e. clients who went idle.
   * Mirrors AiInsightsRepository.countReengagementClients but returns the
   * client identity (name/email) needed to actually send a follow-up.
   */
  async getIdleClients(
    businessId: Types.ObjectId,
    thresholdDate: Date,
    limit: number,
  ): Promise<IdleClient[]> {
    return this.jobModel.aggregate<IdleClient>([
      { $match: { businessId, deletedAt: null, status: JobStatus.COMPLETED } },
      { $group: { _id: '$clientId', lastCompleted: { $max: '$completedAt' } } },
      { $match: { lastCompleted: { $lt: thresholdDate } } },
      {
        $lookup: {
          from: 'jobs',
          let: { clientId: '$_id', lastCompleted: '$lastCompleted' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$businessId', businessId] },
                    { $eq: ['$clientId', '$$clientId'] },
                    { $eq: ['$deletedAt', null] },
                    { $gt: ['$createdAt', '$$lastCompleted'] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'newerJobs',
        },
      },
      { $match: { newerJobs: { $size: 0 } } },
      { $limit: limit },
      {
        $lookup: {
          from: 'clients',
          let: { clientId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$clientId'] },
                deletedAt: null,
              },
            },
          ],
          as: 'clientInfo',
        },
      },
      { $unwind: { path: '$clientInfo', preserveNullAndEmptyArrays: false } },
      {
        $project: {
          _id: 0,
          clientId: { $toString: '$clientInfo._id' },
          name: '$clientInfo.name',
          email: '$clientInfo.email',
        },
      },
    ]);
  }

  /** IDs of non-deleted jobs still in progress past their scheduled date. */
  async findStaleInProgressJobIds(
    businessId: Types.ObjectId,
    cutoff: Date,
    limit: number,
  ): Promise<Types.ObjectId[]> {
    const rows = await this.jobModel
      .find({
        businessId,
        deletedAt: null,
        status: JobStatus.IN_PROGRESS,
        scheduledDate: { $lte: cutoff },
      })
      .select('_id')
      .limit(limit)
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();

    return rows.map((r) => r._id);
  }

  /** Bulk-transitions the given jobs to completed. Returns the count updated. */
  async completeJobs(
    businessId: Types.ObjectId,
    jobIds: Types.ObjectId[],
    completedAt: Date,
  ): Promise<number> {
    if (jobIds.length === 0) return 0;

    const result = await this.jobModel.updateMany(
      { _id: { $in: jobIds }, businessId, deletedAt: null },
      { $set: { status: JobStatus.COMPLETED, completedAt } },
    );

    return result.modifiedCount;
  }

  /** IDs of unpaid (pending/partial) invoices, most recent first. */
  async getUnpaidInvoiceIds(
    businessId: Types.ObjectId,
    limit: number,
  ): Promise<Types.ObjectId[]> {
    const rows = await this.invoiceModel
      .find({
        businessId,
        deletedAt: null,
        status: { $in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] },
      })
      .sort({ invoiceDate: -1 })
      .select('_id')
      .limit(limit)
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();

    return rows.map((r) => r._id);
  }

  /** Counts upcoming, priced, not-yet-started jobs eligible for a price bump. */
  async countFuturePricedJobs(
    businessId: Types.ObjectId,
    now: Date,
  ): Promise<number> {
    return this.jobModel.countDocuments({
      businessId,
      deletedAt: null,
      status: JobStatus.PENDING,
      scheduledDate: { $gte: now },
      price: { $gt: 0 },
    });
  }

  /**
   * Increases the price of every upcoming, priced, not-yet-started job by
   * `pct` percent. Returns the count updated.
   */
  async bumpFutureJobPrices(
    businessId: Types.ObjectId,
    now: Date,
    pct: number,
  ): Promise<number> {
    const result = await this.jobModel.updateMany(
      {
        businessId,
        deletedAt: null,
        status: JobStatus.PENDING,
        scheduledDate: { $gte: now },
        price: { $gt: 0 },
      },
      [
        {
          $set: {
            price: {
              $round: [{ $multiply: ['$price', 1 + pct / 100] }, 2],
            },
          },
        },
      ],
    );

    return result.modifiedCount;
  }
}
