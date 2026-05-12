import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { Announcement } from '../schemas/announcement.schema';
import { Conversation } from '../schemas/conversation.schema';
import {
  Message,
  MessageSender,
  MessageStatus,
} from '../schemas/message.schema';
import { TeamMessage } from '../schemas/team-message.schema';

type TeamMessageRow = TeamMessage & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
};

type AnnouncementRow = Announcement & {
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
};

export interface ConversationThread {
  conversationId: Types.ObjectId;
  client: {
    id: Types.ObjectId;
    fullName: string;
    email: string;
  };
  lastMessageContent: string;
  lastMessageAt?: Date;
  lastMessageSender: MessageSender;
  businessUnreadCount: number;
  clientUnreadCount: number;
}

@Injectable()
export class MessagingRepository {
  private readonly messageModel: ReturnModelType<typeof Message>;
  private readonly conversationModel: ReturnModelType<typeof Conversation>;
  private readonly teamMessageModel: ReturnModelType<typeof TeamMessage>;
  private readonly announcementModel: ReturnModelType<typeof Announcement>;

  constructor(@InjectConnection() connection: Connection) {
    this.messageModel = getModelForClass(Message, {
      existingConnection: connection,
    });
    this.conversationModel = getModelForClass(Conversation, {
      existingConnection: connection,
    });
    this.teamMessageModel = getModelForClass(TeamMessage, {
      existingConnection: connection,
    });
    this.announcementModel = getModelForClass(Announcement, {
      existingConnection: connection,
    });
  }

  async upsertConversation(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<Conversation> {
    const conversation = await this.conversationModel
      .findOneAndUpdate(
        { businessId, clientId },
        { $setOnInsert: { businessId, clientId } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean<Conversation>()
      .exec();
    return conversation;
  }

  async createMessage(data: {
    conversationId: Types.ObjectId;
    businessId: Types.ObjectId;
    clientId: Types.ObjectId;
    sender: MessageSender;
    senderName: string;
    content?: string;
    attachmentUrl?: string;
    publicId?: string;
    mimeType?: string;
    fileName?: string;
    fileSize?: number;
    createdAt?: Date;
  }): Promise<Message> {
    const [message] = await this.messageModel.create([data]);
    return message.toObject() as Message;
  }

  async updateConversationAfterMessage(
    conversationId: Types.ObjectId,
    content: string | undefined,
    sender: MessageSender,
    occurredAt = new Date(),
  ): Promise<void> {
    const unreadField =
      sender === MessageSender.BUSINESS
        ? 'clientUnreadCount'
        : 'businessUnreadCount';

    await this.conversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessageContent: content ?? 'Attachment',
          lastMessageAt: occurredAt,
          lastMessageSender: sender,
        },
        $inc: { [unreadField]: 1 },
      },
    );
  }

  async setConversationActive(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
    isActive: boolean,
  ): Promise<void> {
    await this.conversationModel.updateOne(
      { businessId, clientId },
      { $set: { isActive } },
    );
  }

  async markMessageDelivered(
    messageId: Types.ObjectId,
    deliveredAt = new Date(),
  ): Promise<void> {
    await this.messageModel.updateOne(
      { _id: messageId, status: MessageStatus.SENT },
      { $set: { status: MessageStatus.DELIVERED, deliveredAt } },
    );
  }

  async findMessages(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
    pagination: PaginationParams,
  ): Promise<{ data: Message[]; total: number }> {
    const query = { businessId, clientId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.messageModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<Message[]>()
        .exec(),
      this.messageModel.countDocuments(query).exec(),
    ]);
    return { data, total };
  }

  async findRecentMessages(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
    limit = 20,
  ): Promise<Message[]> {
    return this.messageModel
      .find({ businessId, clientId, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<Message[]>()
      .exec();
  }

  async markMessagesRead(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
    upToMessageId: string,
    readerSender: MessageSender,
    readAt = new Date(),
  ): Promise<void> {
    // Mark messages sent by the OTHER side as read.
    const otherSide =
      readerSender === MessageSender.BUSINESS
        ? MessageSender.CLIENT
        : MessageSender.BUSINESS;

    await this.messageModel.updateMany(
      {
        businessId,
        clientId,
        _id: { $lte: new Types.ObjectId(upToMessageId) },
        sender: otherSide,
        status: { $ne: MessageStatus.READ },
        deletedAt: null,
      },
      { $set: { status: MessageStatus.READ, readAt } },
    );
  }

  async resetUnreadCount(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
    readerSender: MessageSender,
  ): Promise<void> {
    const unreadField =
      readerSender === MessageSender.BUSINESS
        ? 'businessUnreadCount'
        : 'clientUnreadCount';

    await this.conversationModel.updateOne(
      { businessId, clientId },
      { $set: { [unreadField]: 0 } },
    );
  }

  async updateMessageContent(
    id: string,
    businessId: Types.ObjectId,
    sender: MessageSender,
    content: string,
  ): Promise<Message | null> {
    return this.messageModel
      .findOneAndUpdate(
        { _id: id, businessId, sender, deletedAt: null },
        { $set: { content, editedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean<Message>()
      .exec();
  }

  async softDeleteMessage(
    id: string,
    businessId: Types.ObjectId,
    sender: MessageSender,
  ): Promise<Message | null> {
    return this.messageModel
      .findOneAndUpdate(
        { _id: id, businessId, sender, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean<Message>()
      .exec();
  }

  async findConversations(
    businessId: Types.ObjectId,
    pagination: PaginationParams,
  ): Promise<{ data: Conversation[]; total: number }> {
    const query = { businessId };
    const [data, total] = await Promise.all([
      this.conversationModel
        .find(query)
        .sort({ lastMessageAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<Conversation[]>()
        .exec(),
      this.conversationModel.countDocuments(query).exec(),
    ]);
    return { data, total };
  }

  async findConversationThreads(
    businessId: Types.ObjectId,
    pagination: PaginationParams,
  ): Promise<{ data: ConversationThread[]; total: number }> {
    const [data, total] = await Promise.all([
      this.conversationModel
        .aggregate<ConversationThread>([
          { $match: { businessId } },
          { $sort: { lastMessageAt: -1, updatedAt: -1 } },
          { $skip: pagination.skip },
          { $limit: pagination.limit },
          {
            $lookup: {
              from: 'clients',
              localField: 'clientId',
              foreignField: '_id',
              as: 'client',
            },
          },
          {
            $unwind: {
              path: '$client',
              preserveNullAndEmptyArrays: false,
            },
          },
          {
            $project: {
              _id: 0,
              conversationId: '$_id',
              client: {
                id: '$client._id',
                fullName: '$client.name',
                email: '$client.email',
              },
              lastMessageContent: 1,
              lastMessageAt: 1,
              lastMessageSender: 1,
              businessUnreadCount: 1,
              clientUnreadCount: 1,
            },
          },
        ])
        .exec(),
      this.conversationModel.countDocuments({ businessId }).exec(),
    ]);

    return { data, total };
  }

  async findConversationsForClient(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<Conversation[]> {
    return this.conversationModel
      .find({ businessId, clientId })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean<Conversation[]>()
      .exec();
  }

  async findConversationByBusinessAndClient(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<Conversation | null> {
    return this.conversationModel
      .findOne({ businessId, clientId })
      .lean<Conversation>()
      .exec();
  }

  async markAllMessagesReadForClient(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<void> {
    await Promise.all([
      this.messageModel.updateMany(
        {
          businessId,
          clientId,
          sender: MessageSender.BUSINESS,
          status: { $ne: MessageStatus.READ },
          deletedAt: null,
        },
        {
          $set: {
            status: MessageStatus.READ,
            readAt: new Date(),
          },
        },
      ),
      this.conversationModel.updateOne(
        { businessId, clientId },
        { $set: { clientUnreadCount: 0 } },
      ),
    ]);
  }

  async findAttachmentsForClient(
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
    formatFilter: RegExp | null,
    pagination: PaginationParams,
    sort: Record<string, 1 | -1>,
  ): Promise<{ data: Message[]; total: number }> {
    const query: Record<string, unknown> = {
      businessId,
      clientId,
      deletedAt: null,
      attachmentUrl: { $exists: true, $ne: null },
      fileName: { $exists: true, $ne: null },
    };

    if (formatFilter) {
      query['fileName'] = { $regex: formatFilter };
    }

    const [data, total] = await Promise.all([
      this.messageModel
        .find(query)
        .sort(sort)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<Message[]>()
        .exec(),
      this.messageModel.countDocuments(query).exec(),
    ]);

    return { data, total };
  }

  async findAttachmentByIdForClient(
    id: string,
    businessId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<Message | null> {
    return this.messageModel
      .findOne({
        _id: id,
        businessId,
        clientId,
        deletedAt: null,
        attachmentUrl: { $exists: true, $ne: null },
      })
      .lean<Message>()
      .exec();
  }

  async findTeamMessages(
    businessId: Types.ObjectId,
    pagination: PaginationParams,
  ): Promise<{ data: TeamMessage[]; total: number }> {
    const query = { businessId };
    const [data, total] = await Promise.all([
      this.teamMessageModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<TeamMessageRow[]>()
        .exec(),
      this.teamMessageModel.countDocuments(query).exec(),
    ]);

    return {
      data: data.map((message) => this.sanitizeTeamMessage(message)),
      total,
    };
  }

  async createTeamMessage(data: {
    businessId: Types.ObjectId;
    senderId: Types.ObjectId;
    senderName: string;
    content: string;
    createdAt?: Date;
  }): Promise<TeamMessage> {
    const [created] = await this.teamMessageModel.create([data]);
    return this.sanitizeTeamMessage(created.toObject() as TeamMessageRow);
  }

  async findAnnouncements(
    businessId: Types.ObjectId,
    pagination: PaginationParams,
  ): Promise<{ data: Announcement[]; total: number }> {
    const query = { businessId };
    const [data, total] = await Promise.all([
      this.announcementModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<AnnouncementRow[]>()
        .exec(),
      this.announcementModel.countDocuments(query).exec(),
    ]);

    return {
      data: data.map((announcement) => this.sanitizeAnnouncement(announcement)),
      total,
    };
  }

  async createAnnouncement(data: {
    businessId: Types.ObjectId;
    authorId: Types.ObjectId;
    authorName: string;
    title: string;
    description: string;
    createdAt?: Date;
  }): Promise<Announcement> {
    const [created] = await this.announcementModel.create([data]);
    return this.sanitizeAnnouncement(created.toObject() as AnnouncementRow);
  }

  private sanitizeTeamMessage(message: TeamMessageRow): TeamMessage {
    const { __v: _version, updatedAt: _updatedAt, ...safe } = message;
    return safe as TeamMessage;
  }

  private sanitizeAnnouncement(announcement: AnnouncementRow): Announcement {
    const { __v: _version, updatedAt: _updatedAt, ...safe } = announcement;
    return safe as Announcement;
  }
}
