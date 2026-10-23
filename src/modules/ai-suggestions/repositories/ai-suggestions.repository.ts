import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { Client } from '../../clients/schemas/client.schema';
import { Invoice, InvoiceStatus } from '../../invoices/schemas/invoice.schema';
import { Job, JobStatus } from '../../jobs/schemas/job.schema';
import { Payment } from '../../payments/schemas/payment.schema';
import {
  AiSuggestion,
  AiSuggestionExecution,
} from '../schemas/ai-suggestion.schema';
import {
  SuggestionStatus,
  type ClientPaymentHabit,
  type IdleClient,
  type InvoiceOutcomeRow,
  type JobStatusCounts,
  type OverdueInvoice,
} from '../types/ai-suggestions.types';

const MONGO_DUPLICATE_KEY = 11000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Fields written when an ACTIVE suggestion is (re)rendered. */
export type AiSuggestionContent = Pick<
  AiSuggestion,
  | 'kind'
  | 'category'
  | 'copyFingerprint'
  | 'title'
  | 'description'
  | 'recommendation'
  | 'review'
  | 'payload'
>;

export interface AiSuggestionUpdate {
  id: Types.ObjectId;
  set: Partial<AiSuggestionContent>;
}

export interface AiSuggestionOutcomeUpdate {
  id: Types.ObjectId;
  outcome: string;
  outcomeFinal: boolean;
}

/**
 * Read/write repository for the AI Suggestions module.
 *
 * Same self-contained-model pattern as AnalyticsRepository/AiInsightsRepository
 * for business-data reads. It also owns the `ai_suggestions` collection and
 * the bounded mutations behind each suggestion's Execute action.
 */
@Injectable()
export class AiSuggestionsRepository {
  private readonly clientModel: ReturnModelType<typeof Client>;
  private readonly jobModel: ReturnModelType<typeof Job>;
  private readonly invoiceModel: ReturnModelType<typeof Invoice>;
  private readonly paymentModel: ReturnModelType<typeof Payment>;
  private readonly suggestionModel: ReturnModelType<typeof AiSuggestion>;

  constructor(@InjectConnection() connection: Connection) {
    this.clientModel = getModelForClass(Client, {
      existingConnection: connection,
    });
    this.jobModel = getModelForClass(Job, { existingConnection: connection });
    this.invoiceModel = getModelForClass(Invoice, {
      existingConnection: connection,
    });
    this.paymentModel = getModelForClass(Payment, {
      existingConnection: connection,
    });
    this.suggestionModel = getModelForClass(AiSuggestion, {
      existingConnection: connection,
    });
  }

  // ─── Business-data reads (suggestion generation) ────────────────────────────

  /**
   * Unpaid invoices whose due date (or invoice date when no due date was set)
   * is before `overdueBefore`, most overdue first, joined with the client name.
   */
  async getOverdueInvoices(
    businessId: Types.ObjectId,
    overdueBefore: Date,
    limit: number,
  ): Promise<OverdueInvoice[]> {
    return this.invoiceModel.aggregate<OverdueInvoice>([
      {
        $match: {
          businessId,
          deletedAt: null,
          status: { $in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] },
          $or: [
            { dueDate: { $lt: overdueBefore } },
            { dueDate: null, invoiceDate: { $lt: overdueBefore } },
          ],
        },
      },
      {
        $addFields: { effectiveDue: { $ifNull: ['$dueDate', '$invoiceDate'] } },
      },
      { $sort: { effectiveDue: 1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'clients',
          let: { clientId: '$clientId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$clientId'] },
                deletedAt: null,
              },
            },
            { $project: { name: 1 } },
          ],
          as: 'client',
        },
      },
      { $unwind: { path: '$client', preserveNullAndEmptyArrays: false } },
      {
        $project: {
          _id: 0,
          invoiceId: '$_id',
          invoiceNumber: 1,
          clientId: 1,
          clientName: '$client.name',
          totalAmount: 1,
          amountPaid: 1,
          dueDate: '$effectiveDue',
        },
      },
    ]);
  }

  /**
   * Average days from invoice date to final payment, per client, over fully
   * paid invoices dated on/after `since`. Clients with no paid history are omitted.
   */
  async getClientPaymentHabits(
    businessId: Types.ObjectId,
    clientIds: Types.ObjectId[],
    since: Date,
  ): Promise<ClientPaymentHabit[]> {
    if (clientIds.length === 0) return [];

    return this.invoiceModel.aggregate<ClientPaymentHabit>([
      {
        $match: {
          businessId,
          deletedAt: null,
          status: InvoiceStatus.PAID,
          clientId: { $in: clientIds },
          invoiceDate: { $gte: since },
        },
      },
      {
        $lookup: {
          from: 'payments',
          let: { invoiceId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$businessId', businessId] },
                    { $eq: ['$invoiceId', '$$invoiceId'] },
                    { $eq: ['$deletedAt', null] },
                  ],
                },
              },
            },
            { $group: { _id: null, lastPaid: { $max: '$paymentDate' } } },
          ],
          as: 'paid',
        },
      },
      { $unwind: { path: '$paid', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$clientId',
          avgMs: {
            $avg: {
              $max: [0, { $subtract: ['$paid.lastPaid', '$invoiceDate'] }],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          clientId: '$_id',
          avgDaysToPay: { $round: [{ $divide: ['$avgMs', MS_PER_DAY] }, 0] },
        },
      },
    ]);
  }

  /**
   * Returns clients whose most recently completed job finished before
   * `thresholdDate` with no newer job since — i.e. clients who went idle —
   * along with their last job and lifetime completed-job count.
   */
  async getIdleClients(
    businessId: Types.ObjectId,
    thresholdDate: Date,
    limit: number,
  ): Promise<IdleClient[]> {
    return this.jobModel.aggregate<IdleClient>([
      { $match: { businessId, deletedAt: null, status: JobStatus.COMPLETED } },
      { $sort: { completedAt: -1 } },
      {
        $group: {
          _id: '$clientId',
          lastCompletedAt: { $first: '$completedAt' },
          lastJobTitle: { $first: '$title' },
          completedJobs: { $sum: 1 },
        },
      },
      { $match: { lastCompletedAt: { $lt: thresholdDate } } },
      {
        $lookup: {
          from: 'jobs',
          let: { clientId: '$_id', lastCompleted: '$lastCompletedAt' },
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
      { $sort: { lastCompletedAt: 1 } },
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
          clientId: '$clientInfo._id',
          name: '$clientInfo.name',
          email: '$clientInfo.email',
          lastCompletedAt: 1,
          lastJobTitle: 1,
          completedJobs: 1,
        },
      },
    ]);
  }

  /** Counts upcoming, priced, not-yet-started jobs eligible for a price bump. */
  async countFuturePricedJobs(
    businessId: Types.ObjectId,
    now: Date,
  ): Promise<number> {
    return this.jobModel.countDocuments(
      this.futurePricedJobsFilter(businessId, now),
    );
  }

  // ─── Execute-time reads & mutations ─────────────────────────────────────────

  /** Returns the invoice if it is still unpaid and not deleted, else null. */
  async findUnpaidInvoice(
    businessId: Types.ObjectId,
    invoiceId: Types.ObjectId,
  ): Promise<Pick<Invoice, 'totalAmount' | 'amountPaid'> | null> {
    return this.invoiceModel
      .findOne({
        _id: invoiceId,
        businessId,
        deletedAt: null,
        status: { $in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] },
      })
      .select('totalAmount amountPaid')
      .lean<Pick<Invoice, 'totalAmount' | 'amountPaid'>>()
      .exec();
  }

  /** Returns the client's contact details if it exists and is not deleted. */
  async findActiveClient(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<Pick<Client, 'name' | 'email'> | null> {
    return this.clientModel
      .findOne({ _id: clientId, businessId, deletedAt: null })
      .select('name email')
      .lean<Pick<Client, 'name' | 'email'>>()
      .exec();
  }

  /** IDs of upcoming, priced, not-yet-started jobs (bounded). */
  async findFuturePricedJobIds(
    businessId: Types.ObjectId,
    now: Date,
    limit: number,
  ): Promise<Types.ObjectId[]> {
    const rows = await this.jobModel
      .find(this.futurePricedJobsFilter(businessId, now))
      .select('_id')
      .limit(limit)
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();

    return rows.map((r) => r._id);
  }

  /**
   * Increases the price of the given jobs by `pct` percent, re-checking they
   * are still upcoming and unstarted. Returns the count updated.
   */
  async bumpJobPrices(
    businessId: Types.ObjectId,
    jobIds: Types.ObjectId[],
    now: Date,
    pct: number,
  ): Promise<number> {
    if (jobIds.length === 0) return 0;

    const result = await this.jobModel.updateMany(
      { ...this.futurePricedJobsFilter(businessId, now), _id: { $in: jobIds } },
      [
        {
          $set: {
            price: { $round: [{ $multiply: ['$price', 1 + pct / 100] }, 2] },
          },
        },
      ],
    );

    return result.modifiedCount;
  }

  // ─── Outcome reads ──────────────────────────────────────────────────────────

  /** Current payment state of the given invoices (including deleted ones) plus their latest payment date. */
  async getInvoiceOutcomes(
    businessId: Types.ObjectId,
    invoiceIds: Types.ObjectId[],
  ): Promise<InvoiceOutcomeRow[]> {
    if (invoiceIds.length === 0) return [];

    return this.invoiceModel.aggregate<InvoiceOutcomeRow>([
      { $match: { businessId, _id: { $in: invoiceIds } } },
      {
        $lookup: {
          from: 'payments',
          let: { invoiceId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$businessId', businessId] },
                    { $eq: ['$invoiceId', '$$invoiceId'] },
                    { $eq: ['$deletedAt', null] },
                  ],
                },
              },
            },
            { $group: { _id: null, lastPaid: { $max: '$paymentDate' } } },
          ],
          as: 'paid',
        },
      },
      {
        $project: {
          _id: 0,
          invoiceId: '$_id',
          status: 1,
          totalAmount: 1,
          amountPaid: 1,
          deleted: { $ne: [{ $ifNull: ['$deletedAt', null] }, null] },
          lastPaymentDate: {
            $ifNull: [{ $arrayElemAt: ['$paid.lastPaid', 0] }, null],
          },
        },
      },
    ]);
  }

  /**
   * For each (client, after) pair, the creation date of the client's first
   * job created strictly after `after`. Clients with no such job are omitted.
   */
  async getFirstJobCreatedAfter(
    businessId: Types.ObjectId,
    pairs: { clientId: Types.ObjectId; after: Date }[],
  ): Promise<{ clientId: Types.ObjectId; firstCreatedAt: Date }[]> {
    if (pairs.length === 0) return [];

    return this.jobModel.aggregate<{
      clientId: Types.ObjectId;
      firstCreatedAt: Date;
    }>([
      {
        $match: {
          businessId,
          deletedAt: null,
          $or: pairs.map((p) => ({
            clientId: p.clientId,
            createdAt: { $gt: p.after },
          })),
        },
      },
      { $group: { _id: '$clientId', firstCreatedAt: { $min: '$createdAt' } } },
      { $project: { _id: 0, clientId: '$_id', firstCreatedAt: 1 } },
    ]);
  }

  /** Completed/cancelled counts among the given jobs. */
  async getJobStatusCounts(
    businessId: Types.ObjectId,
    jobIds: Types.ObjectId[],
  ): Promise<JobStatusCounts> {
    if (jobIds.length === 0) return { completed: 0, cancelled: 0 };

    const [row] = await this.jobModel.aggregate<JobStatusCounts>([
      { $match: { businessId, _id: { $in: jobIds } } },
      {
        $group: {
          _id: null,
          completed: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', JobStatus.COMPLETED] },
                    { $eq: [{ $ifNull: ['$deletedAt', null] }, null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          cancelled: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$status', JobStatus.CANCELLED] },
                    { $ne: [{ $ifNull: ['$deletedAt', null] }, null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $project: { _id: 0, completed: 1, cancelled: 1 } },
    ]);

    return row ?? { completed: 0, cancelled: 0 };
  }

  /** Sums payment amounts with `start <= paymentDate < end`. */
  async sumRevenueBetween(
    businessId: Types.ObjectId,
    start: Date,
    end: Date,
  ): Promise<number> {
    const [row] = await this.paymentModel.aggregate<{ total: number }>([
      {
        $match: {
          businessId,
          deletedAt: null,
          paymentDate: { $gte: start, $lt: end },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return row?.total ?? 0;
  }

  // ─── Suggestion persistence ─────────────────────────────────────────────────

  /** The most recent suggestion per dedupe key (any status). */
  async findLatestByKeys(
    businessId: Types.ObjectId,
    keys: string[],
  ): Promise<AiSuggestion[]> {
    if (keys.length === 0) return [];

    return this.suggestionModel.aggregate<AiSuggestion>([
      { $match: { businessId, dedupeKey: { $in: keys } } },
      { $sort: { dedupeKey: 1, createdAt: -1 } },
      { $group: { _id: '$dedupeKey', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ]);
  }

  /**
   * Inserts an ACTIVE suggestion for `dedupeKey`, or returns the one a
   * concurrent request already inserted (the partial unique index guarantees
   * at most one ACTIVE per key).
   */
  async insertActive(
    businessId: Types.ObjectId,
    dedupeKey: string,
    content: AiSuggestionContent,
  ): Promise<AiSuggestion> {
    const filter = { businessId, dedupeKey, status: SuggestionStatus.ACTIVE };
    try {
      return await this.suggestionModel
        .findOneAndUpdate(
          filter,
          { $setOnInsert: { ...content, outcomeFinal: false } },
          { upsert: true, returnDocument: 'after' },
        )
        .lean<AiSuggestion>()
        .orFail()
        .exec();
    } catch (error) {
      if ((error as { code?: number }).code !== MONGO_DUPLICATE_KEY)
        throw error;
      return this.suggestionModel
        .findOne(filter)
        .lean<AiSuggestion>()
        .orFail()
        .exec();
    }
  }

  /** Applies per-document $set updates to ACTIVE suggestions in one round trip. */
  async updateActive(
    businessId: Types.ObjectId,
    updates: AiSuggestionUpdate[],
  ): Promise<void> {
    if (updates.length === 0) return;

    await this.suggestionModel.bulkWrite(
      updates.map((u) => ({
        updateOne: {
          filter: { _id: u.id, businessId, status: SuggestionStatus.ACTIVE },
          update: { $set: u.set },
        },
      })),
    );
  }

  /** Expires ACTIVE suggestions whose subject no longer qualifies. */
  async expireActiveExcept(
    businessId: Types.ObjectId,
    keepKeys: string[],
    now: Date,
  ): Promise<void> {
    await this.suggestionModel.updateMany(
      {
        businessId,
        status: SuggestionStatus.ACTIVE,
        dedupeKey: { $nin: keepKeys },
      },
      { $set: { status: SuggestionStatus.EXPIRED, resolvedAt: now } },
    );
  }

  /** Expires one ACTIVE suggestion (its subject went away before it was executed). */
  async expire(
    businessId: Types.ObjectId,
    id: Types.ObjectId,
    now: Date,
  ): Promise<void> {
    await this.suggestionModel.updateOne(
      { _id: id, businessId, status: SuggestionStatus.ACTIVE },
      { $set: { status: SuggestionStatus.EXPIRED, resolvedAt: now } },
    );
  }

  async findActiveById(
    businessId: Types.ObjectId,
    id: Types.ObjectId,
  ): Promise<AiSuggestion | null> {
    return this.suggestionModel
      .findOne({ _id: id, businessId, status: SuggestionStatus.ACTIVE })
      .lean<AiSuggestion>()
      .exec();
  }

  /**
   * Atomically moves an ACTIVE suggestion to `status`. Returns null when it
   * was no longer ACTIVE — this is what prevents a double-clicked Execute
   * from running the action twice.
   */
  async claim(
    businessId: Types.ObjectId,
    id: Types.ObjectId,
    status: SuggestionStatus.EXECUTED | SuggestionStatus.DISMISSED,
    now: Date,
  ): Promise<AiSuggestion | null> {
    const set: Partial<AiSuggestion> = { status, resolvedAt: now };
    if (status === SuggestionStatus.EXECUTED) set.executedAt = now;

    return this.suggestionModel
      .findOneAndUpdate(
        { _id: id, businessId, status: SuggestionStatus.ACTIVE },
        { $set: set },
        { returnDocument: 'after' },
      )
      .lean<AiSuggestion>()
      .exec();
  }

  /** Rolls a failed execution back to ACTIVE so the user can retry. */
  async releaseClaim(
    businessId: Types.ObjectId,
    id: Types.ObjectId,
  ): Promise<void> {
    await this.suggestionModel.updateOne(
      { _id: id, businessId, status: SuggestionStatus.EXECUTED },
      {
        $set: { status: SuggestionStatus.ACTIVE },
        $unset: { executedAt: 1, resolvedAt: 1 },
      },
    );
  }

  /** Records what the execution did, plus an immediate outcome when one is already known. */
  async recordExecution(
    businessId: Types.ObjectId,
    id: Types.ObjectId,
    execution: AiSuggestionExecution,
    outcome?: string,
  ): Promise<void> {
    const set: Partial<AiSuggestion> = { execution };
    if (outcome !== undefined) {
      set.outcome = outcome;
      set.outcomeFinal = true;
    }
    await this.suggestionModel.updateOne(
      { _id: id, businessId },
      { $set: set },
    );
  }

  async countActive(businessId: Types.ObjectId): Promise<number> {
    return this.suggestionModel.countDocuments({
      businessId,
      status: SuggestionStatus.ACTIVE,
    });
  }

  /** Executed suggestions, most recent first. */
  async findExecuted(
    businessId: Types.ObjectId,
    limit: number,
  ): Promise<AiSuggestion[]> {
    return this.suggestionModel
      .find({ businessId, status: SuggestionStatus.EXECUTED })
      .sort({ executedAt: -1 })
      .limit(limit)
      .lean<AiSuggestion[]>()
      .exec();
  }

  async saveOutcomes(
    businessId: Types.ObjectId,
    updates: AiSuggestionOutcomeUpdate[],
  ): Promise<void> {
    if (updates.length === 0) return;

    await this.suggestionModel.bulkWrite(
      updates.map((u) => ({
        updateOne: {
          filter: { _id: u.id, businessId, outcomeFinal: { $ne: true } },
          update: {
            $set: { outcome: u.outcome, outcomeFinal: u.outcomeFinal },
          },
        },
      })),
    );
  }

  private futurePricedJobsFilter(businessId: Types.ObjectId, now: Date) {
    return {
      businessId,
      deletedAt: null,
      status: JobStatus.PENDING,
      scheduledDate: { $gte: now },
      price: { $gt: 0 },
    };
  }
}
