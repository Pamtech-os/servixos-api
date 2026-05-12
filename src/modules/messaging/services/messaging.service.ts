import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Types } from 'mongoose';
import { Readable } from 'stream';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';
import { MESSAGING_MESSAGES } from 'src/common/constants/messages/messaging.messages';
import { PaginationParams } from 'src/common/utils/pagination.util';
import { toBusinessLocalTime } from 'src/common/utils/timezone.util';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { ClientsRepository } from 'src/modules/clients/repositories/clients.repository';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { MessagePayload } from '../messaging.events';
import {
  ConversationThread,
  MessagingRepository,
} from '../repositories/messaging.repository';
import { Announcement } from '../schemas/announcement.schema';
import { Conversation } from '../schemas/conversation.schema';
import { Message, MessageSender } from '../schemas/message.schema';
import { TeamMessage } from '../schemas/team-message.schema';

export interface UploadResult {
  attachmentUrl: string;
  publicId: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
}

export interface ConversationThreadView {
  conversationId: string;
  client: {
    id: string;
    fullName: string;
    email: string;
  };
  lastMessageContent: string;
  lastMessageAt?: string;
  lastMessageSender: MessageSender;
  businessUnreadCount: number;
  clientUnreadCount: number;
}

export interface TeamMessageView {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
}

export interface AnnouncementView {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  createdAt: string;
}

interface PaginatedMessages {
  data: Message[];
  total: number;
}

interface PaginatedConversations {
  data: ConversationThreadView[];
  total: number;
}

interface PaginatedTeamMessages {
  data: TeamMessageView[];
  total: number;
}

interface PaginatedAnnouncements {
  data: AnnouncementView[];
  total: number;
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
const BUSINESS_TZ_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly businessTimezoneCache = new Map<
    string,
    { timezone: string; expiresAt: number }
  >();

  constructor(
    private readonly messagingRepository: MessagingRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly businessRepository: BusinessRepository,
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
    const now = await this.businessNow(params.businessId);

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
      createdAt: now,
    });

    await this.messagingRepository.updateConversationAfterMessage(
      conversation._id,
      params.content,
      params.sender,
      now,
    );

    return message;
  }

  async sendMessageFromBusiness(params: {
    businessId: string;
    userId: string;
    clientId: string;
    content?: string;
    attachmentUrl?: string;
    publicId?: string;
    mimeType?: string;
    fileName?: string;
    fileSize?: number;
  }): Promise<
    | MessagePayload
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const content = params.content?.trim();
      if (!content && !params.attachmentUrl) {
        return new BadRequestException(MESSAGING_MESSAGES.ERROR.EMPTY_CONTENT);
      }

      const businessOid = new Types.ObjectId(params.businessId);
      const client = await this.clientsRepository.findById(
        params.clientId,
        businessOid,
      );
      if (!client) {
        return new NotFoundException(CLIENTS_MESSAGES.ERROR.NOT_FOUND);
      }

      const actor = await this.resolveBusinessActor(
        params.userId,
        params.businessId,
      );

      /**
       * REST and socket flows must persist identical payload structures
       * so both channels stay consistent.
       *
       * Example:
       * - REST POST /messages writes the message
       * - Server emits `message_received` with this exact payload
       * - Any connected room listeners render the same data immediately
       */
      const message = await this.createMessage({
        businessId: params.businessId,
        clientId: params.clientId,
        sender: MessageSender.BUSINESS,
        senderName: actor.actorName,
        content,
        attachmentUrl: params.attachmentUrl,
        publicId: params.publicId,
        mimeType: params.mimeType,
        fileName: params.fileName,
        fileSize: params.fileSize,
      });

      return this.toPayload(message as Message & { createdAt?: Date });
    } catch (error) {
      this.logger.error(
        `sendMessageFromBusiness: failed [businessId=${params.businessId}, clientId=${params.clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
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
  ): Promise<
    PaginatedMessages | NotFoundException | InternalServerErrorException
  > {
    try {
      const businessOid = new Types.ObjectId(businessId);
      const client = await this.clientsRepository.findById(
        clientId,
        businessOid,
      );
      if (!client) {
        return new NotFoundException(CLIENTS_MESSAGES.ERROR.NOT_FOUND);
      }

      const clientOid = new Types.ObjectId(clientId);
      const [messages] = await Promise.all([
        this.messagingRepository.findMessages(
          businessOid,
          clientOid,
          pagination,
        ),
        this.messagingRepository.resetUnreadCount(
          businessOid,
          clientOid,
          MessageSender.BUSINESS,
        ),
      ]);

      return messages;
    } catch (error) {
      this.logger.error(
        `getMessages: failed [businessId=${businessId}, clientId=${clientId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
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
  }): Promise<Date> {
    const businessOid = new Types.ObjectId(params.businessId);
    const clientOid = new Types.ObjectId(params.clientId);
    const readAt = await this.businessNow(params.businessId);

    await this.messagingRepository.markMessagesRead(
      businessOid,
      clientOid,
      params.upToMessageId,
      params.readerSender,
      readAt,
    );

    await this.messagingRepository.resetUnreadCount(
      businessOid,
      clientOid,
      params.readerSender,
    );

    return readAt;
  }

  async markMessagesReadFromBusiness(params: {
    businessId: string;
    userId: string;
    clientId: string;
    upToMessageId: string;
  }): Promise<
    | { upToMessageId: string; readAt: string; readBy: string }
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const client = await this.clientsRepository.findById(
        params.clientId,
        new Types.ObjectId(params.businessId),
      );
      if (!client) {
        return new NotFoundException(CLIENTS_MESSAGES.ERROR.NOT_FOUND);
      }

      const readAt = await this.markRead({
        businessId: params.businessId,
        clientId: params.clientId,
        upToMessageId: params.upToMessageId,
        readerSender: MessageSender.BUSINESS,
      });

      return {
        upToMessageId: params.upToMessageId,
        readAt: readAt.toISOString(),
        readBy: params.userId,
      };
    } catch (error) {
      this.logger.error(
        `markMessagesReadFromBusiness: failed [businessId=${params.businessId}, clientId=${params.clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
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

    if (!message) {
      throw new NotFoundException(MESSAGING_MESSAGES.ERROR.SEND_FAILED);
    }

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

    if (!message) {
      throw new NotFoundException(MESSAGING_MESSAGES.ERROR.SEND_FAILED);
    }

    return message;
  }

  async getConversations(
    businessId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedConversations | InternalServerErrorException> {
    try {
      const result = await this.messagingRepository.findConversationThreads(
        new Types.ObjectId(businessId),
        pagination,
      );

      return {
        data: result.data.map((thread) =>
          this.toConversationThreadView(thread),
        ),
        total: result.total,
      };
    } catch (error) {
      this.logger.error(
        `getConversations: failed [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async uploadAttachment(
    file: Express.Multer.File,
    businessId: string,
  ): Promise<
    UploadResult | BadRequestException | InternalServerErrorException
  > {
    try {
      if (file.size > MAX_FILE_SIZE) {
        this.logger.warn(
          `uploadAttachment: attachment too large [businessId=${businessId}, size=${file.size}]`,
        );
        return new BadRequestException(
          MESSAGING_MESSAGES.ERROR.ATTACHMENT_TOO_LARGE,
        );
      }

      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        this.logger.warn(
          `uploadAttachment: invalid attachment type [businessId=${businessId}, mimeType=${file.mimetype}]`,
        );
        return new BadRequestException(
          MESSAGING_MESSAGES.ERROR.ATTACHMENT_TYPE_INVALID,
        );
      }

      return await new Promise<UploadResult>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `attachments/${businessId}`,
            resource_type: 'auto',
            use_filename: true,
            unique_filename: true,
          },
          (error, result) => {
            if (error || !result) {
              this.logger.error(
                `uploadAttachment: cloudinary upload failed [businessId=${businessId}]: ${error?.message ?? 'No upload response'}`,
              );
              return reject(
                new Error(MESSAGING_MESSAGES.ERROR.ATTACHMENT_UPLOAD_FAILED),
              );
            }
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
    } catch (error) {
      this.logger.error(
        `uploadAttachment: failed [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async listTeamMessages(
    businessId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedTeamMessages | InternalServerErrorException> {
    try {
      const result = await this.messagingRepository.findTeamMessages(
        new Types.ObjectId(businessId),
        pagination,
      );

      return {
        data: result.data.map((row) => this.toTeamMessageView(row)),
        total: result.total,
      };
    } catch (error) {
      this.logger.error(
        `listTeamMessages: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createTeamMessage(params: {
    businessId: string;
    userId: string;
    content: string;
  }): Promise<
    TeamMessageView | BadRequestException | InternalServerErrorException
  > {
    try {
      const content = params.content.trim();
      if (!content) {
        return new BadRequestException(MESSAGING_MESSAGES.ERROR.EMPTY_CONTENT);
      }

      const [actor, createdAt] = await Promise.all([
        this.resolveBusinessActor(params.userId, params.businessId),
        this.businessNow(params.businessId),
      ]);

      const created = await this.messagingRepository.createTeamMessage({
        businessId: new Types.ObjectId(params.businessId),
        senderId: actor.actorId,
        senderName: actor.actorName,
        content,
        createdAt,
      });

      return this.toTeamMessageView(created);
    } catch (error) {
      this.logger.error(
        `createTeamMessage: failed [businessId=${params.businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async listAnnouncements(
    businessId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedAnnouncements | InternalServerErrorException> {
    try {
      const result = await this.messagingRepository.findAnnouncements(
        new Types.ObjectId(businessId),
        pagination,
      );

      return {
        data: result.data.map((row) => this.toAnnouncementView(row)),
        total: result.total,
      };
    } catch (error) {
      this.logger.error(
        `listAnnouncements: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createAnnouncement(params: {
    businessId: string;
    userId: string;
    title: string;
    description: string;
  }): Promise<
    AnnouncementView | BadRequestException | InternalServerErrorException
  > {
    try {
      const title = params.title.trim();
      const description = params.description.trim();
      if (!title || !description) {
        return new BadRequestException(COMMON_MESSAGES.ERROR.BAD_REQUEST);
      }

      /**
       * We stamp `createdAt` using the business local timezone so the same
       * announcement timeline is consistent for teams operating globally.
       *
       * Example:
       * - Business timezone: America/New_York
       * - UTC now: 2026-04-30T21:00:00Z
       * - Stored createdAt: 2026-04-30T17:00:00Z (local wall-clock)
       */
      const [actor, createdAt] = await Promise.all([
        this.resolveBusinessActor(params.userId, params.businessId),
        this.businessNow(params.businessId),
      ]);

      const created = await this.messagingRepository.createAnnouncement({
        businessId: new Types.ObjectId(params.businessId),
        authorId: actor.actorId,
        authorName: actor.actorName,
        title,
        description,
        createdAt,
      });

      return this.toAnnouncementView(created);
    } catch (error) {
      this.logger.error(
        `createAnnouncement: failed [businessId=${params.businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
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

  async listConversationsForClient(
    businessId: string,
    clientId: string,
  ): Promise<Conversation[]> {
    return this.messagingRepository.findConversationsForClient(
      new Types.ObjectId(businessId),
      new Types.ObjectId(clientId),
    );
  }

  async listConversationMessagesForClient(
    businessId: string,
    clientId: string,
    providerId: string,
    pagination: PaginationParams,
  ): Promise<{ data: Message[]; total: number }> {
    if (providerId !== businessId) {
      throw new NotFoundException(MESSAGING_MESSAGES.ERROR.CLIENT_NOT_FOUND);
    }

    return this.messagingRepository.findMessages(
      new Types.ObjectId(businessId),
      new Types.ObjectId(clientId),
      pagination,
    );
  }

  async markConversationAsReadForClient(
    businessId: string,
    clientId: string,
    providerId: string,
  ): Promise<void> {
    if (providerId !== businessId) {
      throw new NotFoundException(MESSAGING_MESSAGES.ERROR.CLIENT_NOT_FOUND);
    }

    await this.messagingRepository.markAllMessagesReadForClient(
      new Types.ObjectId(businessId),
      new Types.ObjectId(clientId),
    );
  }

  async sendMessageFromClient(
    businessId: string,
    clientId: string,
    providerId: string,
    content: string,
  ): Promise<MessagePayload> {
    if (providerId !== businessId) {
      throw new NotFoundException(MESSAGING_MESSAGES.ERROR.CLIENT_NOT_FOUND);
    }

    const client = await this.clientsRepository.findById(
      clientId,
      new Types.ObjectId(businessId),
    );
    if (!client) {
      throw new NotFoundException(CLIENTS_MESSAGES.ERROR.NOT_FOUND);
    }

    const message = await this.createMessage({
      businessId,
      clientId,
      sender: MessageSender.CLIENT,
      senderName: client.name,
      content,
    });

    return this.toPayload(message as Message & { createdAt?: Date });
  }

  async getConversationSummaryForClient(
    businessId: string,
    clientId: string,
    providerId: string,
  ): Promise<Conversation> {
    if (providerId !== businessId) {
      throw new NotFoundException(MESSAGING_MESSAGES.ERROR.CLIENT_NOT_FOUND);
    }

    const conversation =
      await this.messagingRepository.findConversationByBusinessAndClient(
        new Types.ObjectId(businessId),
        new Types.ObjectId(clientId),
      );

    if (!conversation) {
      throw new NotFoundException(MESSAGING_MESSAGES.ERROR.CLIENT_NOT_FOUND);
    }

    return conversation;
  }

  async listAttachmentsForClient(
    businessId: string,
    clientId: string,
    options: {
      formatPattern: RegExp | null;
      pagination: PaginationParams;
      sort: Record<string, 1 | -1>;
    },
  ): Promise<{ data: Message[]; total: number }> {
    return this.messagingRepository.findAttachmentsForClient(
      new Types.ObjectId(businessId),
      new Types.ObjectId(clientId),
      options.formatPattern,
      options.pagination,
      options.sort,
    );
  }

  async getAttachmentForClient(
    businessId: string,
    clientId: string,
    messageId: string,
  ): Promise<Message | null> {
    return this.messagingRepository.findAttachmentByIdForClient(
      messageId,
      new Types.ObjectId(businessId),
      new Types.ObjectId(clientId),
    );
  }

  private toConversationThreadView(
    thread: ConversationThread,
  ): ConversationThreadView {
    return {
      conversationId: thread.conversationId.toString(),
      client: {
        id: thread.client.id.toString(),
        fullName: thread.client.fullName,
        email: thread.client.email,
      },
      lastMessageContent: thread.lastMessageContent,
      lastMessageAt: thread.lastMessageAt?.toISOString(),
      lastMessageSender: thread.lastMessageSender,
      businessUnreadCount: thread.businessUnreadCount,
      clientUnreadCount: thread.clientUnreadCount,
    };
  }

  private toTeamMessageView(message: TeamMessage): TeamMessageView {
    const row = message as TeamMessage & { createdAt?: Date };
    return {
      id: message._id.toString(),
      senderId: message.senderId.toString(),
      senderName: message.senderName,
      content: message.content,
      createdAt: (row.createdAt ?? new Date()).toISOString(),
    };
  }

  private toAnnouncementView(announcement: Announcement): AnnouncementView {
    const row = announcement as Announcement & { createdAt?: Date };
    return {
      id: announcement._id.toString(),
      authorId: announcement.authorId.toString(),
      authorName: announcement.authorName,
      title: announcement.title,
      description: announcement.description,
      createdAt: (row.createdAt ?? new Date()).toISOString(),
    };
  }

  private async resolveBusinessActor(
    userId: string,
    businessId: string,
  ): Promise<{ actorId: Types.ObjectId; actorName: string }> {
    const employee = await this.employeesRepository.findByUserId(
      userId,
      new Types.ObjectId(businessId),
    );

    if (employee) {
      return {
        actorId: employee._id,
        actorName: employee.fullName,
      };
    }

    return {
      actorId: Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : new Types.ObjectId(),
      actorName: 'Business',
    };
  }

  private async businessNow(businessId: string): Promise<Date> {
    const timezone = await this.resolveBusinessTimezone(businessId);
    return toBusinessLocalTime(new Date(), timezone);
  }

  private async resolveBusinessTimezone(businessId: string): Promise<string> {
    const cached = this.businessTimezoneCache.get(businessId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.timezone;
    }

    try {
      const timezone = (await this.businessRepository.findById(businessId))
        ?.timezone;
      const safeTimezone = timezone ?? 'UTC';
      this.businessTimezoneCache.set(businessId, {
        timezone: safeTimezone,
        expiresAt: Date.now() + BUSINESS_TZ_CACHE_TTL_MS,
      });
      return safeTimezone;
    } catch {
      return 'UTC';
    }
  }
}
