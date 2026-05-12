import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { Shift } from '../schemas/shift.schema';

type PopulatedEmployee = {
  _id: Types.ObjectId;
  fullName: string;
};

type ShiftWithMetadata = Shift & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
  employeeId: Types.ObjectId | PopulatedEmployee;
};

@Injectable()
export class ShiftsRepository {
  private readonly shiftModel: ReturnModelType<typeof Shift>;

  constructor(@InjectConnection() connection: Connection) {
    this.shiftModel = getModelForClass(Shift, {
      existingConnection: connection,
    });
  }

  async findWeekShifts(
    businessId: Types.ObjectId,
    weekStartDate: Date,
    employeeId?: string,
  ): Promise<Shift[]> {
    const query: Record<string, unknown> = {
      businessId,
      weekStartDate,
      deletedAt: null,
    };

    if (employeeId) {
      query['employeeId'] = new Types.ObjectId(employeeId);
    }

    const rows = await this.shiftModel
      .find(query)
      .populate({ path: 'employeeId', select: 'fullName' })
      .sort({ shiftDate: 1, startTime: 1 })
      .lean<ShiftWithMetadata[]>()
      .exec();

    return rows.map((row) => this.sanitizeShift(row)!);
  }

  async findById(
    id: string,
    businessId: Types.ObjectId,
  ): Promise<Shift | null> {
    const row = await this.shiftModel
      .findOne({ _id: id, businessId, deletedAt: null })
      .lean<ShiftWithMetadata>()
      .exec();

    return this.sanitizeShift(row);
  }

  async findOverlappingShift(
    businessId: Types.ObjectId,
    employeeId: Types.ObjectId,
    shiftDate: Date,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<Shift | null> {
    const query: Record<string, unknown> = {
      businessId,
      employeeId,
      shiftDate,
      deletedAt: null,
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    };

    if (excludeId) {
      query['_id'] = { $ne: new Types.ObjectId(excludeId) };
    }

    const row = await this.shiftModel
      .findOne(query)
      .lean<ShiftWithMetadata>()
      .exec();

    return this.sanitizeShift(row);
  }

  async create(data: Partial<Shift>, session?: ClientSession): Promise<Shift> {
    const [created] = await this.shiftModel.create([data], { session });
    return this.sanitizeShift(created.toObject() as ShiftWithMetadata) as Shift;
  }

  async updateById(
    id: string,
    businessId: Types.ObjectId,
    update: Partial<Shift>,
    session?: ClientSession,
  ): Promise<Shift | null> {
    const op = this.buildUpdateOperator(update);
    const updated = await this.shiftModel
      .findOneAndUpdate({ _id: id, businessId, deletedAt: null }, op, {
        returnDocument: 'after',
        session,
      })
      .lean<ShiftWithMetadata>()
      .exec();

    return this.sanitizeShift(updated);
  }

  async softDelete(
    id: string,
    businessId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Shift | null> {
    const deleted = await this.shiftModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { returnDocument: 'after', session },
      )
      .lean<ShiftWithMetadata>()
      .exec();

    return this.sanitizeShift(deleted);
  }

  private buildUpdateOperator(update: Partial<Shift>): Record<string, unknown> {
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

  private sanitizeShift(shift: ShiftWithMetadata | null): Shift | null {
    if (!shift) return null;

    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      __v: _version,
      ...safeShift
    } = shift;

    return safeShift as Shift;
  }
}
