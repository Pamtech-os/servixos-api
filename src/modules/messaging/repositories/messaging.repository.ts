import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import {
  Message,
  MessageSender,
  MessageStatus,
} from '../schemas/message.schema';
import { Conversation } from '../schemas/conversation.schema';
import { PaginationParams } from 'src/common/utils/pagination.util';

@Injectable()
export class MessagingRepository {
  private readonly messageModel: ReturnModelType<typeof Message>;
  private readonly conversationModel: ReturnModelType<typeof Conversation>;

  constructor(@InjectConnection() connection: Connection) {
    this.messageModel = getModelForClass(Message, {
      existingConnection: connection,
    });
    this.conversationModel = getModelForClass(Conversation, {
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
  }): Promise<Message> {
    const [message] = await this.messageModel.create([data]);
    return message.toObject() as Message;
  }

  async updateConversationAfterMessage(
    conversationId: Types.ObjectId,
    content: string | undefined,
    sender: MessageSender,
  ): Promise<void> {
    const unreadField =
      sender === MessageSender.BUSINESS
        ? 'clientUnreadCount'
        : 'businessUnreadCount';

    await this.conversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessageContent: content ?? '📎 Attachment',
          lastMessageAt: new Date(),
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

  async markMessageDelivered(messageId: Types.ObjectId): Promise<void> {
    await this.messageModel.updateOne(
      { _id: messageId, status: MessageStatus.SENT },
      { $set: { status: MessageStatus.DELIVERED, deliveredAt: new Date() } },
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
  ): Promise<void> {
    // Mark messages sent by the OTHER side as read
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
      { $set: { status: MessageStatus.READ, readAt: new Date() } },
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
}
