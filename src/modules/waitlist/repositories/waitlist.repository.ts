import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, ModifyResult, QueryFilter } from 'mongoose';
import {
  WaitlistEntry,
  WaitlistPersona,
} from '../schemas/waitlist-entry.schema';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { escapeRegex } from 'src/common/utils/regex.util';
import { formatError } from 'src/common/utils/error.util';

export interface WaitlistFilters {
  search?: string;
  persona?: WaitlistPersona;
  dateFrom?: Date;
  dateTo?: Date;
}

export type WaitlistPersonaCounts = Record<WaitlistPersona, number> & {
  total: number;
};

// Docs fetched per round-trip — fewer network hops than the driver default of 101
const EXPORT_CURSOR_BATCH_SIZE = 1000;

@Injectable()
export class WaitlistRepository implements OnModuleInit {
  private readonly logger = new Logger(WaitlistRepository.name);
  private readonly waitlistModel: ReturnModelType<typeof WaitlistEntry>;

  constructor(@InjectConnection() connection: Connection) {
    this.waitlistModel = getModelForClass(WaitlistEntry, {
      existingConnection: connection,
    });
  }

  // autoIndex is disabled in production, so the unique email index is built explicitly in every
  // environment — it is what guarantees no duplicates under concurrent signups
  async onModuleInit(): Promise<void> {
    try {
      await this.waitlistModel.createIndexes();
    } catch (error) {
      this.logger.error(
        `Failed to build waitlist indexes — duplicate emails must be removed before the unique index can be created: ${formatError(error)}`,
      );
    }
  }

  /** Inserts the entry only if no entry with this email exists; `created` is false for duplicates. */
  async createIfAbsent(data: {
    firstName: string;
    email: string;
    persona: WaitlistPersona;
  }): Promise<{ entry: WaitlistEntry; created: boolean }> {
    const email = data.email.trim().toLowerCase();
    const now = new Date();
    // Atomic upsert with $setOnInsert — a single round-trip with no check-then-insert gap,
    // and an existing entry is never modified. Timestamps are set manually so a duplicate
    // attempt doesn't bump updatedAt.
    const result = await this.waitlistModel
      .findOneAndUpdate(
        { email },
        {
          $setOnInsert: {
            firstName: data.firstName,
            email,
            persona: data.persona,
            createdAt: now,
            updatedAt: now,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          includeResultMetadata: true,
          runValidators: true,
          timestamps: false,
        },
      )
      .lean<ModifyResult<WaitlistEntry>>()
      .exec();

    return {
      entry: result.value as WaitlistEntry,
      created: !result.lastErrorObject?.updatedExisting,
    };
  }

  async deleteById(id: string): Promise<void> {
    await this.waitlistModel.deleteOne({ _id: id }).exec();
  }

  async findAll(
    filters: WaitlistFilters,
    pagination: PaginationParams,
  ): Promise<{ data: WaitlistEntry[]; total: number }> {
    const filter = this.buildFilter(filters);
    const [total, data] = await Promise.all([
      this.waitlistModel.countDocuments(filter).exec(),
      this.waitlistModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<WaitlistEntry[]>()
        .exec(),
    ]);
    return { data, total };
  }

  /** Streams matching entries via a cursor so large exports don't load the whole collection into memory. */
  streamAll(filters: WaitlistFilters): AsyncIterable<WaitlistEntry> {
    return this.waitlistModel
      .find(this.buildFilter(filters))
      .select({ firstName: 1, email: 1, persona: 1, createdAt: 1, _id: 0 })
      .sort({ createdAt: -1 })
      .batchSize(EXPORT_CURSOR_BATCH_SIZE)
      .lean<WaitlistEntry[]>()
      .cursor();
  }

  async countByPersona(): Promise<WaitlistPersonaCounts> {
    const groups = await this.waitlistModel
      .aggregate<{
        _id: WaitlistPersona;
        count: number;
      }>([{ $group: { _id: '$persona', count: { $sum: 1 } } }])
      .exec();

    const counts = { total: 0 } as WaitlistPersonaCounts;
    for (const persona of Object.values(WaitlistPersona)) counts[persona] = 0;
    for (const { _id, count } of groups) {
      counts.total += count;
      if (_id in counts) counts[_id] = count;
    }
    return counts;
  }

  private buildFilter(filters: WaitlistFilters): QueryFilter<WaitlistEntry> {
    const filter: QueryFilter<WaitlistEntry> = {};

    if (filters.search) {
      const regex = new RegExp(escapeRegex(filters.search), 'i');
      filter.$or = [{ firstName: regex }, { email: regex }];
    }

    if (filters.persona) filter.persona = filters.persona;

    if (filters.dateFrom || filters.dateTo) {
      filter.createdAt = {
        ...(filters.dateFrom && { $gte: filters.dateFrom }),
        ...(filters.dateTo && { $lte: filters.dateTo }),
      };
    }

    return filter;
  }
}
