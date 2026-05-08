import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { CLIENT_CACHE_KEYS } from 'src/client/constants/cache-keys';
import { CLIENT_CACHE_TTLS } from 'src/client/constants/cache-ttls';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { JOBS } from 'src/common/constants/agenda.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { AgendaService } from '../../agenda/services/agenda.service';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { JobsRepository } from '../../jobs/repositories/jobs.repository';
import { Contract, ContractStatus } from '../../jobs/schemas/contract.schema';
import { ContractsRepository } from '../../jobs/repositories/contracts.repository';
import { RedisService } from '../../redis/services/redis.service';
import {
  ClientContractDetail,
  ClientContractListItem,
} from '../types/client-portal.types';
import {
  ClientContractSortBy,
  ClientContractStatus,
  ListClientContractsDto,
} from '../dto/list-client-contracts.dto';
import { SortOrder } from '../dto/list-client-invoices.dto';

interface PaginatedClientContracts {
  data: ClientContractListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

@Injectable()
export class ClientContractsService {
  private readonly logger = new Logger(ClientContractsService.name);
  private readonly currency: string;

  constructor(
    config: ConfigService,
    private readonly contractsRepository: ContractsRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly redisService: RedisService,
    private readonly agendaService: AgendaService,
  ) {
    this.currency = config.get<string>('DEFAULT_CURRENCY') ?? 'USD';
  }

  async listContracts(
    businessId: string,
    clientId: string,
    dto: ListClientContractsDto,
  ): Promise<PaginatedClientContracts | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit ?? 10);
      const cacheKey = CLIENT_CACHE_KEYS.contracts(
        clientId,
        JSON.stringify({
          ...dto,
          page: pagination.page,
          limit: pagination.limit,
        }),
      );

      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as PaginatedClientContracts;
      }

      const mapped = this.mapFilters(dto.status);
      const sortOrder = dto.order === SortOrder.ASC ? 1 : -1;
      const businessObjectId = new Types.ObjectId(businessId);
      const clientObjectId = new Types.ObjectId(clientId);

      const { data, total } =
        dto.sort === ClientContractSortBy.AMOUNT
          ? await this.contractsRepository.findAllForClientSortedByJobAmount(
              businessObjectId,
              clientObjectId,
              mapped,
              pagination,
              sortOrder,
            )
          : await this.contractsRepository.findAllForClient(
              businessObjectId,
              clientObjectId,
              mapped,
              pagination,
              { sentAt: sortOrder, createdAt: -1 },
            );

      const enriched = await this.enrichWithAmounts(businessId, data);

      const meta = buildMeta(pagination.page, pagination.limit, total);
      const result: PaginatedClientContracts = {
        data: enriched,
        meta: {
          ...meta,
          hasNextPage: meta.page < meta.totalPages,
          hasPreviousPage: meta.page > 1,
        },
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CLIENT_CACHE_TTLS.CONTRACTS_LIST)
        .catch(() => undefined);

      return result;
    } catch (error) {
      this.logger.error(
        `listContracts: failed [businessId=${businessId}, clientId=${clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getContract(
    businessId: string,
    clientId: string,
    id: string,
  ): Promise<
    ClientContractDetail | NotFoundException | InternalServerErrorException
  > {
    try {
      const cacheKey = CLIENT_CACHE_KEYS.contract(clientId, id);
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as ClientContractDetail;

      const contract = await this.contractsRepository.findByIdForClient(
        id,
        new Types.ObjectId(businessId),
        new Types.ObjectId(clientId),
      );

      if (!contract) {
        return new NotFoundException(CLIENT_MESSAGES.CONTRACT.ERROR.NOT_FOUND);
      }

      const [enriched] = await this.enrichWithAmounts(businessId, [contract]);
      const detail: ClientContractDetail = {
        ...enriched,
        expiresAt: this.computeExpiry(contract.sentAt)?.toISOString(),
        content: contract.html,
        signedAt: contract.signedAt?.toISOString() ?? null,
      };

      await this.redisService
        .set(
          cacheKey,
          JSON.stringify(detail),
          CLIENT_CACHE_TTLS.CONTRACT_SINGLE,
        )
        .catch(() => undefined);

      return detail;
    } catch (error) {
      this.logger.error(
        `getContract: failed [businessId=${businessId}, clientId=${clientId}, id=${id}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async signContract(
    businessId: string,
    clientId: string,
    userId: string,
    id: string,
  ): Promise<
    | { id: string; status: 'signed'; signedAt: string }
    | ConflictException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const [existing, business] = await Promise.all([
        this.contractsRepository.findByIdForClient(
          id,
          new Types.ObjectId(businessId),
          new Types.ObjectId(clientId),
        ),
        this.businessRepository.findById(businessId),
      ]);

      if (!existing) {
        return new NotFoundException(CLIENT_MESSAGES.CONTRACT.ERROR.NOT_FOUND);
      }

      if (existing.status === ContractStatus.SIGNED) {
        return new ConflictException(
          CLIENT_MESSAGES.CONTRACT.ERROR.ALREADY_SIGNED,
        );
      }

      const signedAt = this.toBusinessLocalTime(
        new Date(),
        business?.timezone ?? 'UTC',
      );

      const signed = await this.contractsRepository.signContractForClient(
        id,
        new Types.ObjectId(businessId),
        new Types.ObjectId(clientId),
        signedAt,
      );

      if (!signed) {
        const latest = await this.contractsRepository.findByIdForClient(
          id,
          new Types.ObjectId(businessId),
          new Types.ObjectId(clientId),
        );
        if (latest?.status === ContractStatus.SIGNED) {
          return {
            id: latest._id.toString(),
            status: 'signed',
            signedAt: (latest.signedAt ?? signedAt).toISOString(),
          };
        }

        return new ConflictException(
          CLIENT_MESSAGES.CONTRACT.ERROR.ALREADY_SIGNED,
        );
      }

      void this.agendaService.now(JOBS.ACTIVITY_LOG_WRITE, {
        businessId,
        actorId: userId,
        actorRole: 'client',
        action: 'Signed contract',
        category: 'job',
        resourceId: id,
        resourceType: 'Contract',
      });

      await Promise.all([
        this.redisService
          .del(CLIENT_CACHE_KEYS.contract(clientId, id))
          .catch(() => undefined),
        this.redisService
          .del(CLIENT_CACHE_KEYS.dashboard(clientId))
          .catch(() => undefined),
        this.redisService
          .delByPattern(`client:contracts:${clientId}:*`)
          .catch(() => 0),
        this.redisService
          .delByPattern(`client:activities:${clientId}:*`)
          .catch(() => 0),
      ]);

      return {
        id: signed._id.toString(),
        status: 'signed',
        signedAt: (signed.signedAt ?? signedAt).toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `signContract: failed [businessId=${businessId}, clientId=${clientId}, id=${id}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async countPendingContracts(
    businessId: string,
    clientId: string,
  ): Promise<number> {
    try {
      return await this.contractsRepository.countForClient(
        new Types.ObjectId(businessId),
        new Types.ObjectId(clientId),
        ContractStatus.SENT,
      );
    } catch {
      return 0;
    }
  }

  private async enrichWithAmounts(
    businessId: string,
    contracts: Contract[],
  ): Promise<ClientContractListItem[]> {
    const jobIds = contracts.map((contract) => contract.jobId);
    const jobs = await this.jobsRepository.findByIds(
      jobIds,
      new Types.ObjectId(businessId),
    );
    const jobMap = new Map(jobs.map((job) => [job._id.toString(), job]));

    return contracts.map((contract) => {
      const job = jobMap.get(contract.jobId.toString());
      const amount = this.toMinorUnits(job?.price ?? 0);

      return {
        id: contract._id.toString(),
        name: contract.title,
        dateSent: contract.sentAt?.toISOString(),
        amount,
        status: this.mapStatus(contract),
        currency: this.currency,
      };
    });
  }

  private mapStatus(
    contract: Contract,
  ): 'awaiting_signature' | 'signed' | 'expired' | 'cancelled' {
    if (contract.status === ContractStatus.SIGNED) return 'signed';
    if (contract.status === ContractStatus.CANCELLED) return 'cancelled';

    const expiresAt = this.computeExpiry(contract.sentAt);
    if (
      contract.status === ContractStatus.SENT &&
      expiresAt &&
      expiresAt.getTime() < Date.now()
    ) {
      return 'expired';
    }

    return 'awaiting_signature';
  }

  private mapFilters(status: ClientContractStatus | undefined): {
    status?: ContractStatus;
    sentBefore?: Date;
  } {
    if (!status) return {};

    switch (status) {
      case ClientContractStatus.SIGNED:
        return { status: ContractStatus.SIGNED };
      case ClientContractStatus.CANCELLED:
        return { status: ContractStatus.CANCELLED };
      case ClientContractStatus.EXPIRED:
        return {
          status: ContractStatus.SENT,
          sentBefore: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        };
      default:
        return { status: ContractStatus.SENT };
    }
  }

  private computeExpiry(sentAt?: Date): Date | null {
    if (!sentAt) return null;

    return new Date(sentAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  /**
   * Converts UTC wall-clock into the business local timestamp before persistence.
   *
   * Example:
   * - utcDate: 2026-05-08T15:00:00.000Z
   * - timezone: America/New_York (UTC-4)
   * - stored value: 2026-05-08T11:00:00.000Z
   */
  private toBusinessLocalTime(utcDate: Date, timezone: string): Date {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(utcDate);

      const p: Record<string, string> = {};
      for (const part of parts) {
        p[part.type] = part.value;
      }

      const hour = p['hour'] === '24' ? '00' : p['hour'];
      return new Date(
        `${p['year']}-${p['month']}-${p['day']}T${hour}:${p['minute']}:${p['second']}Z`,
      );
    } catch {
      return utcDate;
    }
  }

  private toMinorUnits(amount: number): number {
    return Math.round((amount ?? 0) * 100);
  }
}
