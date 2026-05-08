import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { escapeRegex } from 'src/common/utils/regex.util';
import { Client } from '../clients/schemas/client.schema';
import { Payment, PaymentMode, PaymentStatus } from './schemas/payment.schema';

interface ListPaymentsFilters {
  search?: string;
  status?: PaymentStatus;
  paymentMode?: PaymentMode;
  dateFrom?: Date;
  dateTo?: Date;
}

type PaymentWithMetadata = Payment & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
};

@Injectable()
export class PaymentsRepository {
  private readonly paymentModel: ReturnModelType<typeof Payment>;
  private readonly clientModel: ReturnModelType<typeof Client>;

  constructor(@InjectConnection() connection: Connection) {
    this.paymentModel = getModelForClass(Payment, {
      existingConnection: connection,
    });
    this.clientModel = getModelForClass(Client, {
      existingConnection: connection,
    });
  }

  async findAll(
    businessId: Types.ObjectId,
    filters: ListPaymentsFilters,
    pagination: PaginationParams,
  ): Promise<{ data: Payment[]; total: number }> {
    const query: Record<string, unknown> = { businessId, deletedAt: null };

    if (filters.status) {
      query['status'] = filters.status;
    }

    if (filters.paymentMode) {
      query['paymentMode'] = filters.paymentMode;
    }

    if (filters.dateFrom || filters.dateTo) {
      const paymentDate: Record<string, Date> = {};
      if (filters.dateFrom) paymentDate['$gte'] = filters.dateFrom;
      if (filters.dateTo) paymentDate['$lte'] = filters.dateTo;
      query['paymentDate'] = paymentDate;
    }

    if (filters.search) {
      const searchRegex = this.buildSearchRegex(filters.search);
      const clientIds = await this.resolveClientIdsBySearch(
        businessId,
        filters.search,
      );

      query['$or'] = [
        { paymentMode: { $regex: searchRegex } },
        { notes: { $regex: searchRegex } },
        { businessName: { $regex: searchRegex } },
        ...(clientIds.length > 0 ? [{ clientId: { $in: clientIds } }] : []),
      ];
    }

    const [data, total] = await Promise.all([
      this.paymentModel
        .find(query)
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<PaymentWithMetadata[]>()
        .exec(),
      this.paymentModel.countDocuments(query).exec(),
    ]);

    return { data: this.sanitizePayments(data), total };
  }

  async findById(
    id: string,
    businessId: Types.ObjectId,
  ): Promise<Payment | null> {
    const payment = await this.paymentModel
      .findOne({ _id: id, businessId, deletedAt: null })
      .lean<PaymentWithMetadata>()
      .exec();

    return this.sanitizePayment(payment);
  }

  async create(
    data: Partial<Payment>,
    session?: ClientSession,
  ): Promise<Payment> {
    const [payment] = await this.paymentModel.create([data], { session });
    return this.sanitizePayment(
      payment.toObject() as PaymentWithMetadata,
    ) as Payment;
  }

  async updateById(
    id: string,
    businessId: Types.ObjectId,
    update: Partial<Payment>,
    session?: ClientSession,
  ): Promise<Payment | null> {
    const op = this.buildUpdateOperator(update);
    const payment = await this.paymentModel
      .findOneAndUpdate({ _id: id, businessId, deletedAt: null }, op, {
        returnDocument: 'after',
        session,
      })
      .lean<PaymentWithMetadata>()
      .exec();

    return this.sanitizePayment(payment);
  }

  async softDelete(
    id: string,
    businessId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Payment | null> {
    const payment = await this.paymentModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { returnDocument: 'after', session },
      )
      .lean<PaymentWithMetadata>()
      .exec();

    return this.sanitizePayment(payment);
  }

  async sumPaidForInvoice(
    businessId: Types.ObjectId,
    invoiceId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    const query = this.paymentModel.aggregate<{ total: number }>([
      {
        $match: {
          businessId,
          invoiceId,
          deletedAt: null,
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    if (session) query.session(session);

    const [row] = await query.exec();

    return row?.total ?? 0;
  }

  private async resolveClientIdsBySearch(
    businessId: Types.ObjectId,
    search: string,
  ): Promise<Types.ObjectId[]> {
    const searchRegex = this.buildSearchRegex(search);
    const rows = await this.clientModel
      .find({
        businessId,
        deletedAt: null,
        $or: [
          { name: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
        ],
      })
      .select('_id')
      .limit(30)
      .lean<Array<{ _id: Types.ObjectId }>>()
      .exec();

    return rows.map((row) => row._id);
  }

  async hasLinkedPayment(
    businessId: Types.ObjectId,
    invoiceId: Types.ObjectId,
  ): Promise<boolean> {
    const row = await this.paymentModel
      .findOne({ businessId, invoiceId, deletedAt: null })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>()
      .exec();

    return !!row;
  }

  private buildUpdateOperator(
    update: Partial<Payment>,
  ): Record<string, unknown> {
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

  private buildSearchRegex(search: string): RegExp {
    return new RegExp(escapeRegex(search), 'i');
  }

  private sanitizePayments(payments: PaymentWithMetadata[]): Payment[] {
    return payments.map((payment) => this.sanitizePayment(payment)!);
  }

  private sanitizePayment(payment: PaymentWithMetadata | null): Payment | null {
    if (!payment) return null;

    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      __v: _version,
      ...safePayment
    } = payment;

    return safePayment as Payment;
  }
}
