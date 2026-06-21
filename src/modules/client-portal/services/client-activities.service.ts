import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CLIENT_CACHE_KEYS } from 'src/client/constants/cache-keys';
import { CLIENT_CACHE_TTLS } from 'src/client/constants/cache-ttls';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { InvoicesRepository } from '../../invoices/repositories/invoices.repository';
import { ContractsRepository } from '../../contracts/repositories/contracts.repository';
import { ContractStatus } from '../../contracts/schemas/contract.schema';
import { MessagingService } from '../../messaging/services/messaging.service';
import { MessageSender } from '../../messaging/schemas/message.schema';
import { PaymentsRepository } from '../../payments/repositories/payments.repository';
import { RedisService } from '../../redis/services/redis.service';
import {
  ClientActivityType,
  ListClientActivitiesDto,
} from '../dto/list-client-activities.dto';
import { ClientActivityItem } from '../types/client-portal.types';

interface PaginatedActivities {
  data: ClientActivityItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class ClientActivitiesService {
  private readonly logger = new Logger(ClientActivitiesService.name);

  constructor(
    private readonly invoicesRepository: InvoicesRepository,
    private readonly paymentsRepository: PaymentsRepository,
    private readonly contractsRepository: ContractsRepository,
    private readonly messagingService: MessagingService,
    private readonly redisService: RedisService,
  ) {}

  async listActivities(
    businessId: string,
    clientId: string,
    dto: ListClientActivitiesDto,
  ): Promise<PaginatedActivities | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit ?? 10);
      const queryHash = JSON.stringify({
        ...dto,
        page: pagination.page,
        limit: pagination.limit,
      });

      const cacheKey = CLIENT_CACHE_KEYS.activities(clientId, queryHash);
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as PaginatedActivities;

      const result = dto.type
        ? await this.listTypeActivities(
            businessId,
            clientId,
            dto.type,
            pagination,
          )
        : await this.listMixedActivities(businessId, clientId, pagination);

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CLIENT_CACHE_TTLS.ACTIVITIES)
        .catch(() => undefined);

      return result;
    } catch (error) {
      this.logger.error(
        `listActivities: failed [businessId=${businessId}, clientId=${clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async listRecentActivities(
    businessId: string,
    clientId: string,
    limit = 10,
  ): Promise<ClientActivityItem[]> {
    const result = await this.listMixedActivities(businessId, clientId, {
      page: 1,
      limit,
      skip: 0,
    });

    return result.data;
  }

  private async listTypeActivities(
    businessId: string,
    clientId: string,
    type: ClientActivityType,
    pagination: { page: number; limit: number; skip: number },
  ): Promise<PaginatedActivities> {
    const bId = new Types.ObjectId(businessId);
    const cId = new Types.ObjectId(clientId);

    if (type === ClientActivityType.INVOICE) {
      const { data, total } = await this.invoicesRepository.findAllForClient(
        bId,
        cId,
        {},
        pagination,
        { field: 'invoiceDate', direction: -1 },
      );

      return {
        data: data.map((invoice) => ({
          id: invoice._id.toString(),
          description: `Invoice ${invoice.invoiceNumber} was issued`,
          type: 'invoice',
          referenceId: invoice._id.toString(),
          date: invoice.invoiceDate.toISOString(),
        })),
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    }

    if (type === ClientActivityType.PAYMENT) {
      const { data, total } = await this.paymentsRepository.findAllForClient(
        bId,
        cId,
        pagination,
      );

      return {
        data: data.map((payment) => ({
          id: payment._id.toString(),
          description: `Payment of ${Math.round(payment.amount * 100)} was received`,
          type: 'payment',
          referenceId: payment._id.toString(),
          date: payment.paymentDate.toISOString(),
        })),
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    }

    if (type === ClientActivityType.CONTRACT) {
      const { data, total } = await this.contractsRepository.findAllForClient(
        bId,
        cId,
        {},
        pagination,
        { sentAt: -1, createdAt: -1 },
      );

      return {
        data: data.map((contract) => ({
          id: contract._id.toString(),
          description:
            contract.status === ContractStatus.SIGNED
              ? `Contract ${contract.title} was signed`
              : `Contract ${contract.title} was sent`,
          type: 'contract',
          referenceId: contract._id.toString(),
          date: (
            contract.signedAt ??
            contract.sentAt ??
            new Date()
          ).toISOString(),
        })),
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    }

    if (type === ClientActivityType.MESSAGE) {
      const { data, total } =
        await this.messagingService.listConversationMessagesForClient(
          businessId,
          clientId,
          businessId,
          pagination,
        );

      return {
        data: data.map((message) => ({
          id: message._id.toString(),
          description:
            message.sender === MessageSender.BUSINESS
              ? 'New message from service provider'
              : 'Message sent',
          type: 'message',
          referenceId: message._id.toString(),
          date: (message as { createdAt?: Date }).createdAt
            ? (
                (message as { createdAt?: Date }).createdAt as Date
              ).toISOString()
            : new Date().toISOString(),
        })),
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    }

    const { data, total } =
      await this.messagingService.listAttachmentsForClient(
        businessId,
        clientId,
        {
          formatPattern: null,
          pagination,
          sort: { createdAt: -1 },
        },
      );

    return {
      data: data.map((message) => ({
        id: message._id.toString(),
        description: `File ${message.fileName ?? 'attachment'} is available`,
        type: 'file',
        referenceId: message._id.toString(),
        date: (message as { createdAt?: Date }).createdAt
          ? ((message as { createdAt?: Date }).createdAt as Date).toISOString()
          : new Date().toISOString(),
      })),
      meta: buildMeta(pagination.page, pagination.limit, total),
    };
  }

  private async listMixedActivities(
    businessId: string,
    clientId: string,
    pagination: { page: number; limit: number; skip: number },
  ): Promise<PaginatedActivities> {
    const bId = new Types.ObjectId(businessId);
    const cId = new Types.ObjectId(clientId);
    const sampleLimit = Math.min(pagination.page * pagination.limit, 60);

    const [invoices, payments, contracts, messages, attachments] =
      await Promise.all([
        this.invoicesRepository.findAllForClient(
          bId,
          cId,
          {},
          { page: 1, limit: sampleLimit, skip: 0 },
          { field: 'invoiceDate', direction: -1 },
        ),
        this.paymentsRepository.findAllForClient(bId, cId, {
          page: 1,
          limit: sampleLimit,
          skip: 0,
        }),
        this.contractsRepository.findAllForClient(
          bId,
          cId,
          {},
          { skip: 0, limit: sampleLimit },
          { sentAt: -1, createdAt: -1 },
        ),
        this.messagingService.listConversationMessagesForClient(
          businessId,
          clientId,
          businessId,
          { page: 1, limit: sampleLimit, skip: 0 },
        ),
        this.messagingService.listAttachmentsForClient(businessId, clientId, {
          formatPattern: null,
          pagination: { page: 1, limit: sampleLimit, skip: 0 },
          sort: { createdAt: -1 },
        }),
      ]);

    const activityRows: ClientActivityItem[] = [
      ...invoices.data.map((invoice) => ({
        id: `inv-${invoice._id.toString()}`,
        description: `Invoice ${invoice.invoiceNumber} was issued`,
        type: 'invoice' as const,
        referenceId: invoice._id.toString(),
        date: invoice.invoiceDate.toISOString(),
      })),
      ...payments.data.map((payment) => ({
        id: `pay-${payment._id.toString()}`,
        description: `Payment of ${Math.round(payment.amount * 100)} was received`,
        type: 'payment' as const,
        referenceId: payment._id.toString(),
        date: payment.paymentDate.toISOString(),
      })),
      ...contracts.data.map((contract) => ({
        id: `ctr-${contract._id.toString()}`,
        description:
          contract.status === ContractStatus.SIGNED
            ? `Contract ${contract.title} was signed`
            : `Contract ${contract.title} was sent`,
        type: 'contract' as const,
        referenceId: contract._id.toString(),
        date: (
          contract.signedAt ??
          contract.sentAt ??
          new Date()
        ).toISOString(),
      })),
      ...messages.data.map((message) => ({
        id: `msg-${message._id.toString()}`,
        description:
          message.sender === MessageSender.BUSINESS
            ? 'New message from service provider'
            : 'Message sent',
        type: 'message' as const,
        referenceId: message._id.toString(),
        date: (message as { createdAt?: Date }).createdAt
          ? ((message as { createdAt?: Date }).createdAt as Date).toISOString()
          : new Date().toISOString(),
      })),
      ...attachments.data.map((message) => ({
        id: `file-${message._id.toString()}`,
        description: `File ${message.fileName ?? 'attachment'} is available`,
        type: 'file' as const,
        referenceId: message._id.toString(),
        date: (message as { createdAt?: Date }).createdAt
          ? ((message as { createdAt?: Date }).createdAt as Date).toISOString()
          : new Date().toISOString(),
      })),
    ];

    // Pre-parse timestamps once (O(n)) so the comparator is a plain subtraction
    // instead of constructing two Date objects per comparison (O(n log n) Date allocations).
    const withTs = activityRows.map((row) => ({
      ...row,
      _ts: new Date(row.date).getTime(),
    }));
    withTs.sort((a, b) => b._ts - a._ts);

    const sliced = withTs
      .slice(pagination.skip, pagination.skip + pagination.limit)
      .map(({ _ts, ...row }) => row);

    return {
      data: sliced,
      meta: buildMeta(pagination.page, pagination.limit, activityRows.length),
    };
  }
}
