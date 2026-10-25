import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { ClockRecord, ClockStatus } from '../schemas/clock-record.schema';

export interface ClockHistoryFilters {
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class ClockRecordsRepository {
  private readonly clockRecordModel: ReturnModelType<typeof ClockRecord>;

  constructor(@InjectConnection() connection: Connection) {
    this.clockRecordModel = getModelForClass(ClockRecord, {
      existingConnection: connection,
    });
  }

  async create(
    data: Partial<ClockRecord>,
    session?: ClientSession,
  ): Promise<ClockRecord> {
    const [created] = await this.clockRecordModel.create([data], { session });
    return created.toObject() as ClockRecord;
  }

  async findActive(
    businessId: Types.ObjectId,
    employeeId: Types.ObjectId,
  ): Promise<ClockRecord | null> {
    return this.clockRecordModel
      .findOne({
        businessId,
        employeeId,
        clockOutAt: null,
        deletedAt: null,
        status: { $in: [ClockStatus.CLOCKED_IN, ClockStatus.ON_BREAK] },
      })
      .lean<ClockRecord>()
      .exec();
  }

  async findById(
    id: string,
    businessId: Types.ObjectId,
  ): Promise<ClockRecord | null> {
    return this.clockRecordModel
      .findOne({ _id: id, businessId, deletedAt: null })
      .lean<ClockRecord>()
      .exec();
  }

  async clockOutActive(
    businessId: Types.ObjectId,
    employeeId: Types.ObjectId,
    clockOutAt: Date,
    totalHours: number,
  ): Promise<ClockRecord | null> {
    return this.clockRecordModel
      .findOneAndUpdate(
        {
          businessId,
          employeeId,
          clockOutAt: null,
          deletedAt: null,
          status: { $in: [ClockStatus.CLOCKED_IN, ClockStatus.ON_BREAK] },
        },
        {
          $set: {
            clockOutAt,
            totalHours,
            status: ClockStatus.CLOCKED_OUT,
          },
          $unset: { breakStartedAt: '' },
        },
        { returnDocument: 'after' },
      )
      .lean<ClockRecord>()
      .exec();
  }

  async startBreak(
    businessId: Types.ObjectId,
    employeeId: Types.ObjectId,
    breakStartedAt: Date,
  ): Promise<ClockRecord | null> {
    return this.clockRecordModel
      .findOneAndUpdate(
        {
          businessId,
          employeeId,
          clockOutAt: null,
          deletedAt: null,
          status: ClockStatus.CLOCKED_IN,
          breakStartedAt: null,
        },
        {
          $set: {
            breakStartedAt,
            status: ClockStatus.ON_BREAK,
          },
        },
        { returnDocument: 'after' },
      )
      .lean<ClockRecord>()
      .exec();
  }

  async endBreak(
    businessId: Types.ObjectId,
    employeeId: Types.ObjectId,
    breakDurationMinutes: number,
  ): Promise<ClockRecord | null> {
    return this.clockRecordModel
      .findOneAndUpdate(
        {
          businessId,
          employeeId,
          clockOutAt: null,
          deletedAt: null,
          status: ClockStatus.ON_BREAK,
          breakStartedAt: { $exists: true, $ne: null },
        },
        {
          $inc: {
            breakMinutes: breakDurationMinutes,
          },
          $set: { status: ClockStatus.CLOCKED_IN },
          $unset: { breakStartedAt: '' },
        },
        { returnDocument: 'after' },
      )
      .lean<ClockRecord>()
      .exec();
  }

  async findRecentByEmployee(
    businessId: Types.ObjectId,
    employeeId: Types.ObjectId,
    limit = 3,
  ): Promise<ClockRecord[]> {
    return this.clockRecordModel
      .find({ businessId, employeeId, deletedAt: null })
      .sort({ clockInAt: -1 })
      .limit(limit)
      .lean<ClockRecord[]>()
      .exec();
  }

  async findHistoryByEmployee(
    businessId: Types.ObjectId,
    employeeId: Types.ObjectId,
    filters: ClockHistoryFilters,
    pagination: PaginationParams,
  ): Promise<{ data: ClockRecord[]; total: number }> {
    const query: Record<string, unknown> = {
      businessId,
      employeeId,
      deletedAt: null,
    };

    if (filters.startDate || filters.endDate) {
      query['clockInAt'] = {};
      if (filters.startDate) {
        (query['clockInAt'] as Record<string, Date>)['$gte'] =
          filters.startDate;
      }
      if (filters.endDate) {
        (query['clockInAt'] as Record<string, Date>)['$lte'] = filters.endDate;
      }
    }

    const [data, total] = await Promise.all([
      this.clockRecordModel
        .find(query)
        .sort({ clockInAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<ClockRecord[]>()
        .exec(),
      this.clockRecordModel.countDocuments(query).exec(),
    ]);

    return { data, total };
  }

  async sumTotalHoursWithinRange(
    businessId: Types.ObjectId,
    employeeId: Types.ObjectId,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const results = await this.clockRecordModel
      .aggregate<{ _id: null; total: number }>([
        {
          $match: {
            businessId,
            employeeId,
            deletedAt: null,
            totalHours: { $ne: null },
            clockInAt: { $gte: startDate, $lt: endDate },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalHours' },
          },
        },
      ])
      .exec();

    const total = results[0]?.total;
    return typeof total === 'number' ? total : 0;
  }
}
