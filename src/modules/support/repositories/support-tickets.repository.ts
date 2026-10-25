import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Schema, Model, Types } from 'mongoose';
import {
  SupportTicket,
  TicketCategory,
  TicketPriority,
} from '../schemas/support-ticket.schema';
import { PaginationParams } from 'src/common/utils/pagination.util';

@Injectable()
export class SupportTicketsRepository {
  private readonly ticketModel: ReturnModelType<typeof SupportTicket>;
  private readonly connection: Connection;

  constructor(@InjectConnection() connection: Connection) {
    this.connection = connection;
    this.ticketModel = getModelForClass(SupportTicket, {
      existingConnection: connection,
    });
  }

  async create(data: {
    subject: string;
    description: string;
    priority: TicketPriority;
    category: TicketCategory;
    requesterId: string;
    requesterName: string;
    requesterEmail: string;
    businessId: string;
    businessName: string;
  }): Promise<SupportTicket> {
    const ticketNumber = await this.nextTicketNumber();
    const [doc] = await this.ticketModel.create([
      {
        ...data,
        requesterId: new Types.ObjectId(data.requesterId),
        businessId: new Types.ObjectId(data.businessId),
        ticketNumber,
      },
    ]);
    return doc.toObject() as SupportTicket;
  }

  async findByBusiness(
    businessId: string,
    pagination: PaginationParams,
  ): Promise<{ data: SupportTicket[]; total: number }> {
    const filter = { businessId: new Types.ObjectId(businessId) };
    const [total, data] = await Promise.all([
      this.ticketModel.countDocuments(filter).exec(),
      this.ticketModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<SupportTicket[]>()
        .exec(),
    ]);
    return { data, total };
  }

  async findByIdAndBusiness(
    id: string,
    businessId: string,
  ): Promise<SupportTicket | null> {
    return this.ticketModel
      .findOne({
        _id: new Types.ObjectId(id),
        businessId: new Types.ObjectId(businessId),
      })
      .lean<SupportTicket>()
      .exec();
  }

  // Atomic sequential ticket number using a counters collection
  private async nextTicketNumber(): Promise<string> {
    let CounterModel: Model<{ _id: string; seq: number }>;
    try {
      CounterModel = this.connection.model<{ _id: string; seq: number }>(
        'Counter',
      );
    } catch {
      CounterModel = this.connection.model<{ _id: string; seq: number }>(
        'Counter',
        new Schema({ _id: String, seq: { type: Number, default: 0 } }),
        'counters',
      );
    }
    const doc = await CounterModel.findOneAndUpdate(
      { _id: 'support_ticket' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    ).lean();
    return `T-${String(doc.seq).padStart(4, '0')}`;
  }
}
