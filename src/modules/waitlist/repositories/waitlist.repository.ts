import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, QueryFilter } from 'mongoose';
import {
  WaitlistEntry,
  WaitlistPersona,
} from '../schemas/waitlist-entry.schema';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { escapeRegex } from 'src/common/utils/regex.util';

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
export class WaitlistRepository {
  private readonly waitlistModel: ReturnModelType<typeof WaitlistEntry>;

  constructor(@InjectConnection() connection: Connection) {
    this.waitlistModel = getModelForClass(WaitlistEntry, {
      existingConnection: connection,
    });
  }

  async create(data: {
    firstName: string;
    email: string;
    persona: WaitlistPersona;
  }): Promise<WaitlistEntry> {
    const doc = await this.waitlistModel.create(data);
    return doc.toObject() as WaitlistEntry;
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
