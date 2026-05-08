import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { toTwoDecimal } from 'src/common/utils/number.util';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { escapeRegex } from 'src/common/utils/regex.util';
import { Client } from '../clients/schemas/client.schema';
import { Invoice, InvoiceStatus } from './schemas/invoice.schema';

interface ListInvoicesFilters {
  search?: string;
  clientId?: string;
  status?: InvoiceStatus;
}

export interface InvoiceListStatistics {
  totalCollected: number;
  outstanding: number;
}

export interface InvoiceReceivablesStatistics {
  totalIncome: number;
  received: number;
  pending: number;
  overdue: number;
  outstanding: number;
}

type PopulatedClient = {
  _id: Types.ObjectId;
  name: string;
  email: string;
};

type InvoiceWithMetadata = Invoice & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
  clientId: Types.ObjectId | PopulatedClient;
};

@Injectable()
export class InvoicesRepository {
  private readonly invoiceModel: ReturnModelType<typeof Invoice>;
  private readonly clientModel: ReturnModelType<typeof Client>;

  constructor(@InjectConnection() connection: Connection) {
    this.invoiceModel = getModelForClass(Invoice, {
      existingConnection: connection,
    });
    this.clientModel = getModelForClass(Client, {
      existingConnection: connection,
    });
  }

  async findAll(
    businessId: Types.ObjectId,
    filters: ListInvoicesFilters,
    pagination: PaginationParams,
  ): Promise<{
    data: Invoice[];
    total: number;
    statistics: InvoiceListStatistics;
  }> {
    const query: Record<string, unknown> = { businessId, deletedAt: null };
    const statisticsQuery: Record<string, unknown> = {
      businessId,
      deletedAt: null,
    };

    if (filters.clientId) {
      const clientId = new Types.ObjectId(filters.clientId);
      query['clientId'] = clientId;
      statisticsQuery['clientId'] = clientId;
    }

    if (filters.status) {
      query['status'] = filters.status;
    }

    if (filters.search) {
      const clientIds = await this.resolveClientIdsBySearch(
        businessId,
        filters.search,
      );
      const searchRegex = this.buildSearchRegex(filters.search);
      const searchOrFilter = [
        { invoiceNumber: { $regex: searchRegex } },
        ...(clientIds.length > 0 ? [{ clientId: { $in: clientIds } }] : []),
      ];

      query['$or'] = searchOrFilter;
      statisticsQuery['$or'] = searchOrFilter;
    }

    const [data, total, statisticRows] = await Promise.all([
      this.invoiceModel
        .find(query)
        .populate({ path: 'clientId', select: 'name email' })
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<InvoiceWithMetadata[]>()
        .exec(),
      this.invoiceModel.countDocuments(query).exec(),
      this.invoiceModel
        .aggregate<{ totalAmount: number; totalCollected: number }>([
          { $match: statisticsQuery },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$totalAmount' },
              totalCollected: { $sum: '$amountPaid' },
            },
          },
        ])
        .exec(),
    ]);

    const summary = statisticRows[0];
    const totalCollected = toTwoDecimal(summary?.totalCollected ?? 0);
    const outstanding = toTwoDecimal(
      Math.max((summary?.totalAmount ?? 0) - totalCollected, 0),
    );

    return {
      data: this.sanitizeInvoices(data),
      total,
      statistics: {
        totalCollected,
        outstanding,
      },
    };
  }

  async findById(
    id: string,
    businessId: Types.ObjectId,
    populateClient = false,
    session?: ClientSession,
  ): Promise<Invoice | null> {
    const query = this.invoiceModel.findOne({
      _id: id,
      businessId,
      deletedAt: null,
    });
    if (populateClient) {
      query.populate({ path: 'clientId', select: 'name email' });
    }
    if (session) query.session(session);

    const invoice = await query.lean<InvoiceWithMetadata>().exec();
    return this.sanitizeInvoice(invoice);
  }

  async findByInvoiceNumber(
    businessId: Types.ObjectId,
    invoiceNumber: string,
  ): Promise<Invoice | null> {
    const invoice = await this.invoiceModel
      .findOne({ businessId, invoiceNumber, deletedAt: null })
      .lean<InvoiceWithMetadata>()
      .exec();

    return this.sanitizeInvoice(invoice);
  }

  async create(
    data: Partial<Invoice>,
    session?: ClientSession,
  ): Promise<Invoice> {
    const [invoice] = await this.invoiceModel.create([data], { session });
    return this.sanitizeInvoice(
      invoice.toObject() as InvoiceWithMetadata,
    ) as Invoice;
  }

  async updateById(
    id: string,
    businessId: Types.ObjectId,
    update: Partial<Invoice>,
    session?: ClientSession,
  ): Promise<Invoice | null> {
    const op = this.buildUpdateOperator(update);
    const invoice = await this.invoiceModel
      .findOneAndUpdate({ _id: id, businessId, deletedAt: null }, op, {
        returnDocument: 'after',
        session,
      })
      .lean<InvoiceWithMetadata>()
      .exec();

    return this.sanitizeInvoice(invoice);
  }

  async softDelete(
    id: string,
    businessId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Invoice | null> {
    const invoice = await this.invoiceModel
      .findOneAndUpdate(
        { _id: id, businessId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { returnDocument: 'after', session },
      )
      .lean<InvoiceWithMetadata>()
      .exec();

    return this.sanitizeInvoice(invoice);
  }

  async findByJobId(
    jobId: Types.ObjectId,
    businessId: Types.ObjectId,
  ): Promise<Invoice[]> {
    const data = await this.invoiceModel
      .find({ jobId, businessId, deletedAt: null })
      .lean<InvoiceWithMetadata[]>()
      .exec();

    return this.sanitizeInvoices(data);
  }

  async getPaidSummaryByJob(
    businessId: Types.ObjectId,
    jobId: Types.ObjectId,
  ): Promise<{ amountPaid: number; totalInvoiced: number }> {
    const [summary] = await this.invoiceModel
      .aggregate<{ amountPaid: number; totalInvoiced: number }>([
        {
          $match: {
            businessId,
            jobId,
            deletedAt: null,
          },
        },
        {
          $group: {
            _id: null,
            amountPaid: { $sum: '$amountPaid' },
            totalInvoiced: { $sum: '$totalAmount' },
          },
        },
      ])
      .exec();

    return {
      amountPaid: summary?.amountPaid ?? 0,
      totalInvoiced: summary?.totalInvoiced ?? 0,
    };
  }

  /**
   * Computes invoice receivable KPIs using business-local "now" to classify aging.
   *
   * Example:
   * - totalIncome: 1,000
   * - received: 400
   * - unpaid invoice A (due next week): 300 -> pending
   * - unpaid invoice B (due yesterday): 300 -> overdue
   * - outstanding: 600
   */
  async getReceivablesStatistics(
    businessId: Types.ObjectId,
    asOf: Date,
  ): Promise<InvoiceReceivablesStatistics> {
    const [row] = await this.invoiceModel
      .aggregate<{
        totalIncome: number;
        received: number;
        outstanding: number;
        pending: number;
        overdue: number;
      }>([
        {
          $match: {
            businessId,
            deletedAt: null,
          },
        },
        {
          $project: {
            totalAmount: '$totalAmount',
            amountPaid: '$amountPaid',
            dueDate: '$dueDate',
            outstandingAmount: {
              $max: [{ $subtract: ['$totalAmount', '$amountPaid'] }, 0],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalIncome: { $sum: '$totalAmount' },
            received: { $sum: '$amountPaid' },
            outstanding: { $sum: '$outstandingAmount' },
            pending: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$outstandingAmount', 0] },
                      {
                        $or: [
                          { $eq: ['$dueDate', null] },
                          { $gte: ['$dueDate', asOf] },
                        ],
                      },
                    ],
                  },
                  '$outstandingAmount',
                  0,
                ],
              },
            },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$outstandingAmount', 0] },
                      { $ne: ['$dueDate', null] },
                      { $lt: ['$dueDate', asOf] },
                    ],
                  },
                  '$outstandingAmount',
                  0,
                ],
              },
            },
          },
        },
      ])
      .exec();

    return {
      totalIncome: toTwoDecimal(row?.totalIncome ?? 0),
      received: toTwoDecimal(row?.received ?? 0),
      pending: toTwoDecimal(row?.pending ?? 0),
      overdue: toTwoDecimal(row?.overdue ?? 0),
      outstanding: toTwoDecimal(row?.outstanding ?? 0),
    };
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

  private buildSearchRegex(search: string): RegExp {
    return new RegExp(escapeRegex(search), 'i');
  }

  private buildUpdateOperator(
    update: Partial<Invoice>,
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

  private sanitizeInvoices(invoices: InvoiceWithMetadata[]): Invoice[] {
    return invoices.map((invoice) => this.sanitizeInvoice(invoice)!);
  }

  private sanitizeInvoice(invoice: InvoiceWithMetadata | null): Invoice | null {
    if (!invoice) return null;

    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      __v: _version,
      ...safeInvoice
    } = invoice;

    return safeInvoice as Invoice;
  }
}
