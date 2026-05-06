import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { MessagingRepository } from './messaging.repository';
import { Message, MessageSender } from './schemas/message.schema';
import { Conversation } from './schemas/conversation.schema';
import { MessagePayload } from './messaging.events';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { MESSAGING_MESSAGES } from 'src/common/constants/messages/messaging.messages';
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';
import { ClientsRepository } from '../clients/clients.repository';

export interface UploadResult {
  attachmentUrl: string;
  publicId: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;

@Injectable()
export class MessagingService {
  constructor(
    private readonly messagingRepository: MessagingRepository,
    private readonly clientsRepository: ClientsRepository,
  ) {}

  async createMessage(params: {
    businessId: string;
    clientId: string;
    sender: MessageSender;
    senderName: string;
    content?: string;
    attachmentUrl?: string;
    publicId?: string;
    mimeType?: string;
    fileName?: string;
    fileSize?: number;
  }): Promise<Message> {
    const businessOid = new Types.ObjectId(params.businessId);
    const clientOid = new Types.ObjectId(params.clientId);

    const conversation = await this.messagingRepository.upsertConversation(
      businessOid,
      clientOid,
    );

    const message = await this.messagingRepository.createMessage({
      conversationId: conversation._id,
      businessId: businessOid,
      clientId: clientOid,
      sender: params.sender,
      senderName: params.senderName,
      content: params.content,
      attachmentUrl: params.attachmentUrl,
      publicId: params.publicId,
      mimeType: params.mimeType,
      fileName: params.fileName,
      fileSize: params.fileSize,
    });

    await this.messagingRepository.updateConversationAfterMessage(
      conversation._id,
      params.content,
      params.sender,
    );

    return message;
  }

  async getOrCreateConversation(
    businessId: string,
    clientId: string,
  ): Promise<{ conversation: Conversation; messages: MessagePayload[] }> {
    const businessOid = new Types.ObjectId(businessId);
    const clientOid = new Types.ObjectId(clientId);

    const conversation = await this.messagingRepository.upsertConversation(
      businessOid,
      clientOid,
    );

    const recent = await this.messagingRepository.findRecentMessages(
      businessOid,
      clientOid,
      20,
    );

    return {
      conversation,
      messages: recent
        .reverse()
        .map((m) => this.toPayload(m as Message & { createdAt?: Date })),
    };
  }

  async markDelivered(messageId: Types.ObjectId): Promise<void> {
    await this.messagingRepository.markMessageDelivered(messageId);
  }

  async getMessages(
    businessId: string,
    clientId: string,
    pagination: PaginationParams,
  ): Promise<{ data: Message[]; total: number }> {
    const client = await this.clientsRepository.findById(
      clientId,
      new Types.ObjectId(businessId),
    );
    if (!client) throw new NotFoundException(CLIENTS_MESSAGES.ERROR.NOT_FOUND);

    return this.messagingRepository.findMessages(
      new Types.ObjectId(businessId),
      new Types.ObjectId(clientId),
      pagination,
    );
  }

  async getRecentMessages(
    businessId: string,
    clientId: string,
    limit = 20,
  ): Promise<Message[]> {
    return this.messagingRepository.findRecentMessages(
      new Types.ObjectId(businessId),
      new Types.ObjectId(clientId),
      limit,
    );
  }

  async markRead(params: {
    businessId: string;
    clientId: string;
    upToMessageId: string;
    readerSender: MessageSender;
  }): Promise<void> {
    const businessOid = new Types.ObjectId(params.businessId);
    const clientOid = new Types.ObjectId(params.clientId);

    await this.messagingRepository.markMessagesRead(
      businessOid,
      clientOid,
      params.upToMessageId,
      params.readerSender,
    );

    await this.messagingRepository.resetUnreadCount(
      businessOid,
      clientOid,
      params.readerSender,
    );
  }

  async setRoomActive(
    businessId: string,
    clientId: string,
    isActive: boolean,
  ): Promise<void> {
    await this.messagingRepository.setConversationActive(
      new Types.ObjectId(businessId),
      new Types.ObjectId(clientId),
      isActive,
    );
  }

  async editMessage(params: {
    messageId: string;
    businessId: string;
    sender: MessageSender;
    content: string;
  }): Promise<Message> {
    const message = await this.messagingRepository.updateMessageContent(
      params.messageId,
      new Types.ObjectId(params.businessId),
      params.sender,
      params.content,
    );

    if (!message)
      throw new NotFoundException(MESSAGING_MESSAGES.ERROR.SEND_FAILED);
    return message;
  }

  async deleteMessage(params: {
    messageId: string;
    businessId: string;
    sender: MessageSender;
  }): Promise<Message> {
    const message = await this.messagingRepository.softDeleteMessage(
      params.messageId,
      new Types.ObjectId(params.businessId),
      params.sender,
    );

    if (!message)
      throw new NotFoundException(MESSAGING_MESSAGES.ERROR.SEND_FAILED);
    return message;
  }

  async getConversations(
    businessId: string,
    pagination: PaginationParams,
  ): Promise<{ data: Conversation[]; total: number }> {
    return this.messagingRepository.findConversations(
      new Types.ObjectId(businessId),
      pagination,
    );
  }

  async uploadAttachment(
    file: Express.Multer.File,
    businessId: string,
  ): Promise<UploadResult> {
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File size exceeds the 10 MB limit');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('File type not supported');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `attachments/${businessId}`,
          resource_type: 'auto',
          use_filename: true,
          unique_filename: true,
        },
        (error, result) => {
          if (error || !result)
            return reject(new Error(error?.message ?? 'Upload failed'));
          resolve({
            attachmentUrl: result.secure_url,
            publicId: result.public_id,
            mimeType: file.mimetype,
            fileName: file.originalname,
            fileSize: file.size,
          });
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  toPayload(message: Message & { createdAt?: Date }): MessagePayload {
    return {
      id: message._id.toString(),
      conversationId: message.conversationId.toString(),
      businessId: message.businessId.toString(),
      clientId: message.clientId.toString(),
      sender: message.sender,
      senderName: message.senderName,
      content: message.content,
      status: message.status,
      deliveredAt: message.deliveredAt?.toISOString(),
      readAt: message.readAt?.toISOString(),
      editedAt: message.editedAt?.toISOString(),
      attachmentUrl: message.attachmentUrl,
      publicId: message.publicId,
      mimeType: message.mimeType,
      fileName: message.fileName,
      fileSize: message.fileSize,
      createdAt: (message.createdAt ?? new Date()).toISOString(),
    };
  }
}
