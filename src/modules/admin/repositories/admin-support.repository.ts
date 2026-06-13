import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, PipelineStage, Types } from 'mongoose';
import {
  SupportTicket,
  TicketStatus,
} from '../../support/schemas/support-ticket.schema';
import { Admin } from '../schemas/admin.schema';
import { PaginationParams } from 'src/common/utils/pagination.util';

interface TicketFilters {
  search?: string;
  status?: TicketStatus;
}

export interface TicketStats {
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
}

interface FacetResult {
  open: [{ count: number }?];
  inProgress: [{ count: number }?];
  resolved: [{ count: number }?];
  closed: [{ count: number }?];
}

@Injectable()
export class AdminSupportRepository {
  private readonly ticketModel: ReturnModelType<typeof SupportTicket>;
  private readonly adminModel: ReturnModelType<typeof Admin>;

  constructor(@InjectConnection() connection: Connection) {
    this.ticketModel = getModelForClass(SupportTicket, {
      existingConnection: connection,
    });
    this.adminModel = getModelForClass(Admin, {
      existingConnection: connection,
    });
  }

  async getStats(): Promise<TicketStats> {
    const [result] = await this.ticketModel
      .aggregate<FacetResult>([
        {
          $facet: {
            open: [
              { $match: { status: TicketStatus.OPEN } },
              { $count: 'count' },
            ],
            inProgress: [
              { $match: { status: TicketStatus.IN_PROGRESS } },
              { $count: 'count' },
            ],
            resolved: [
              { $match: { status: TicketStatus.RESOLVED } },
              { $count: 'count' },
            ],
            closed: [
              { $match: { status: TicketStatus.CLOSED } },
              { $count: 'count' },
            ],
          },
        },
      ])
      .exec();

    return {
      open: result?.open[0]?.count ?? 0,
      inProgress: result?.inProgress[0]?.count ?? 0,
      resolved: result?.resolved[0]?.count ?? 0,
      closed: result?.closed[0]?.count ?? 0,
    };
  }

  async findAll(
    filters: TicketFilters,
    pagination: PaginationParams,
  ): Promise<{ data: SupportTicket[]; total: number }> {
    const matchStage = this.buildMatchStage(filters);

    const pipeline: PipelineStage[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'admins',
          localField: 'assigneeId',
          foreignField: '_id',
          as: 'assignee',
          pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
        },
      },
      {
        $addFields: {
          assigneeName: {
            $cond: [
              { $gt: [{ $size: '$assignee' }, 0] },
              {
                $concat: [
                  { $arrayElemAt: ['$assignee.firstName', 0] },
                  ' ',
                  { $arrayElemAt: ['$assignee.lastName', 0] },
                ],
              },
              null,
            ],
          },
        },
      },
      { $project: { assignee: 0, replies: 0 } },
    ];

    const [countResult, data] = await Promise.all([
      this.ticketModel
        .aggregate<{ total: number }>([...pipeline, { $count: 'total' }])
        .exec(),
      this.ticketModel
        .aggregate<SupportTicket>([
          ...pipeline,
          { $sort: { createdAt: -1 } },
          { $skip: pagination.skip },
          { $limit: pagination.limit },
        ])
        .exec(),
    ]);

    return { data, total: countResult[0]?.total ?? 0 };
  }

  async findById(id: string): Promise<SupportTicket | null> {
    return this.ticketModel.findById(id).lean<SupportTicket>().exec();
  }

  async assign(
    id: string,
    adminId: string | null,
  ): Promise<SupportTicket | null> {
    const update =
      adminId === null
        ? {
            $unset: { assigneeId: '', assigneeName: '' },
            $set: { status: TicketStatus.OPEN },
          }
        : {
            $set: {
              assigneeId: new Types.ObjectId(adminId),
              status: TicketStatus.IN_PROGRESS,
            },
          };

    return this.ticketModel
      .findByIdAndUpdate(id, update, { returnDocument: 'after' })
      .lean<SupportTicket>()
      .exec();
  }

  async addReply(
    id: string,
    reply: {
      content: string;
      authorId: string;
      authorName: string;
      authorType: 'admin' | 'user';
    },
  ): Promise<SupportTicket | null> {
    return this.ticketModel
      .findByIdAndUpdate(
        id,
        {
          $push: {
            replies: {
              content: reply.content,
              authorId: new Types.ObjectId(reply.authorId),
              authorName: reply.authorName,
              authorType: reply.authorType,
              createdAt: new Date(),
            },
          },
        },
        { returnDocument: 'after' },
      )
      .lean<SupportTicket>()
      .exec();
  }

  async resolve(id: string): Promise<SupportTicket | null> {
    return this.ticketModel
      .findByIdAndUpdate(
        id,
        { $set: { status: TicketStatus.RESOLVED, resolvedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean<SupportTicket>()
      .exec();
  }

  async close(id: string): Promise<SupportTicket | null> {
    return this.ticketModel
      .findByIdAndUpdate(
        id,
        { $set: { status: TicketStatus.CLOSED, closedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean<SupportTicket>()
      .exec();
  }

  /** Retrieve all non-deleted admins for the assign modal. */
  async listAdmins(): Promise<Pick<Admin, '_id' | 'firstName' | 'lastName'>[]> {
    return this.adminModel
      .find({ deletedAt: null, isActive: true })
      .select({ firstName: 1, lastName: 1 })
      .sort({ firstName: 1 })
      .lean<Pick<Admin, '_id' | 'firstName' | 'lastName'>[]>()
      .exec();
  }

  private buildMatchStage(filters: TicketFilters): Record<string, unknown> {
    const match: Record<string, unknown> = {};

    if (filters.search) {
      const regex = new RegExp(
        filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      match['$or'] = [
        { ticketNumber: regex },
        { subject: regex },
        { requesterName: regex },
        { businessName: regex },
      ];
    }

    if (filters.status) {
      match['status'] = filters.status;
    }

    return match;
  }
}
