import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CLIENT_CACHE_KEYS } from 'src/client/constants/cache-keys';
import { CLIENT_CACHE_TTLS } from 'src/client/constants/cache-ttls';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { MessagingService } from '../../messaging/services/messaging.service';
import { RedisService } from '../../redis/services/redis.service';
import { ListClientMessagesDto } from '../dto/list-client-messages.dto';

@Injectable()
export class ClientMessagesService {
  private readonly logger = new Logger(ClientMessagesService.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly businessRepository: BusinessRepository,
    private readonly redisService: RedisService,
  ) {}

  async listConversations(
    businessId: string,
    clientId: string,
  ): Promise<
    | Array<{
        id: string;
        serviceProvider: {
          id: string;
          businessName: string;
          supportEmail?: string;
          avatarInitials: string;
        };
        lastMessageContent: string;
        lastMessageAt?: string;
        clientUnreadCount: number;
      }>
    | InternalServerErrorException
  > {
    try {
      const cacheKey = CLIENT_CACHE_KEYS.conversations(clientId);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Array<{
          id: string;
          serviceProvider: {
            id: string;
            businessName: string;
            supportEmail?: string;
            avatarInitials: string;
          };
          lastMessageContent: string;
          lastMessageAt?: string;
          clientUnreadCount: number;
        }>;
      }

      const [conversations, business] = await Promise.all([
        this.messagingService.listConversationsForClient(businessId, clientId),
        this.businessRepository.findById(businessId),
      ]);

      const providerName = business?.name ?? 'Service Provider';
      const providerEmail = business?.email;
      const initials = this.initials(providerName);

      const data = conversations.map((conversation) => ({
        id: conversation._id.toString(),
        serviceProvider: {
          id: conversation.businessId.toString(),
          businessName: providerName,
          supportEmail: providerEmail,
          avatarInitials: initials,
        },
        lastMessageContent: conversation.lastMessageContent,
        lastMessageAt: conversation.lastMessageAt?.toISOString(),
        clientUnreadCount: conversation.clientUnreadCount,
      }));

      await this.redisService
        .set(cacheKey, JSON.stringify(data), CLIENT_CACHE_TTLS.CONVERSATIONS)
        .catch(() => undefined);

      return data;
    } catch (error) {
      this.logger.error(
        `listConversations: failed [businessId=${businessId}, clientId=${clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async listConversationMessages(
    businessId: string,
    clientId: string,
    providerId: string,
    dto: ListClientMessagesDto,
  ): Promise<
    | {
        data: Array<{
          id: string;
          sender: 'business' | 'client';
          senderName: string;
          content?: string;
          isRead: boolean;
          attachments: Array<{
            url: string;
            fileName?: string;
            mimeType?: string;
          }>;
          createdAt: string;
        }>;
        meta: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        };
      }
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const pagination = resolvePagination(dto.page, dto.limit ?? 20);
      const cacheKey = CLIENT_CACHE_KEYS.messages(
        clientId,
        providerId,
        pagination.page,
      );
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as {
          data: Array<{
            id: string;
            sender: 'business' | 'client';
            senderName: string;
            content?: string;
            isRead: boolean;
            attachments: Array<{
              url: string;
              fileName?: string;
              mimeType?: string;
            }>;
            createdAt: string;
          }>;
          meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
          };
        };
      }

      const { data, total } =
        await this.messagingService.listConversationMessagesForClient(
          businessId,
          clientId,
          providerId,
          pagination,
        );

      const mapped = data.map((message) => ({
        id: message._id.toString(),
        sender: message.sender,
        senderName: message.senderName,
        content: message.content,
        isRead: !!message.readAt,
        attachments: message.attachmentUrl
          ? [
              {
                url: message.attachmentUrl,
                fileName: message.fileName,
                mimeType: message.mimeType,
              },
            ]
          : [],
        createdAt: (message as { createdAt?: Date }).createdAt
          ? ((message as { createdAt?: Date }).createdAt as Date).toISOString()
          : new Date().toISOString(),
      }));

      const meta = buildMeta(pagination.page, pagination.limit, total);
      const result = { data: mapped, meta };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CLIENT_CACHE_TTLS.MESSAGES)
        .catch(() => undefined);

      return result;
    } catch (error) {
      if (error instanceof NotFoundException) return error;

      this.logger.error(
        `listConversationMessages: failed [businessId=${businessId}, clientId=${clientId}, providerId=${providerId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async markConversationAsRead(
    businessId: string,
    clientId: string,
    providerId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      await this.messagingService.markConversationAsReadForClient(
        businessId,
        clientId,
        providerId,
      );

      await Promise.all([
        this.redisService
          .del(CLIENT_CACHE_KEYS.conversations(clientId))
          .catch(() => undefined),
        this.redisService
          .delByPattern(`client:messages:${clientId}:${providerId}:*`)
          .catch(() => 0),
      ]);

      return null;
    } catch (error) {
      if (error instanceof NotFoundException) return error;

      this.logger.error(
        `markConversationAsRead: failed [businessId=${businessId}, clientId=${clientId}, providerId=${providerId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async sendMessage(
    businessId: string,
    clientId: string,
    providerId: string,
    content: string,
  ): Promise<
    | {
        id: string;
        sender: 'business' | 'client';
        senderName: string;
        content?: string;
        isRead: boolean;
        attachments: [];
        createdAt: string;
      }
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const payload = await this.messagingService.sendMessageFromClient(
        businessId,
        clientId,
        providerId,
        content,
      );

      await Promise.all([
        this.redisService
          .del(CLIENT_CACHE_KEYS.conversations(clientId))
          .catch(() => undefined),
        this.redisService
          .delByPattern(`client:messages:${clientId}:${providerId}:*`)
          .catch(() => 0),
      ]);

      return {
        id: payload.id,
        sender: payload.sender as 'business' | 'client',
        senderName: payload.senderName,
        content: payload.content,
        isRead: payload.sender === 'client',
        attachments: [],
        createdAt: payload.createdAt,
      };
    } catch (error) {
      if (error instanceof NotFoundException) return error;

      this.logger.error(
        `sendMessage: failed [businessId=${businessId}, clientId=${clientId}, providerId=${providerId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getConversationSummary(
    businessId: string,
    clientId: string,
    providerId: string,
  ): Promise<
    | {
        id: string;
        lastMessageContent: string;
        lastMessageAt?: string;
        clientUnreadCount: number;
      }
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const conversation =
        await this.messagingService.getConversationSummaryForClient(
          businessId,
          clientId,
          providerId,
        );

      return {
        id: conversation._id.toString(),
        lastMessageContent: conversation.lastMessageContent,
        lastMessageAt: conversation.lastMessageAt?.toISOString(),
        clientUnreadCount: conversation.clientUnreadCount,
      };
    } catch (error) {
      if (error instanceof NotFoundException) return error;

      this.logger.error(
        `getConversationSummary: failed [businessId=${businessId}, clientId=${clientId}, providerId=${providerId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

    return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
  }
}
