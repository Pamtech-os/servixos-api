import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { REQUESTS_MESSAGES } from 'src/common/constants/messages/requests.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { BusinessRepository } from '../business/business.repository';
import { ClientsRepository } from '../clients/clients.repository';
import { RedisService } from '../redis/redis.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import {
  RequestListStatistics,
  RequestsRepository,
} from './requests.repository';
import {
  RequestStatus,
  ServiceRequest,
} from './schemas/service-request.schema';

export interface PaginatedRequests {
  data: ServiceRequest[];
  meta: ReturnType<typeof buildMeta>;
  statistics: RequestListStatistics;
}

const requestsListVersionKey = (businessId: string): string =>
  `requests:list:version:${businessId}`;

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly requestsRepository: RequestsRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly redisService: RedisService,
  ) {}

  async listRequests(
    businessId: string,
    dto: ListRequestsDto,
  ): Promise<PaginatedRequests | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const cacheKey = await this.buildRequestsListCacheKey(
        businessId,
        dto,
        pagination.page,
        pagination.limit,
      );
      const cached = await this.getCachedRequestsList(cacheKey);
      if (cached) return cached;

      const { data, total, statistics } = await this.requestsRepository.findAll(
        new Types.ObjectId(businessId),
        { status: dto.status, search: dto.search },
        pagination,
      );
      const result: PaginatedRequests = {
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
        statistics,
      };
      await this.setCachedRequestsList(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.error(
        `listRequests: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getRequest(
    id: string,
    businessId: string,
  ): Promise<
    ServiceRequest | NotFoundException | InternalServerErrorException
  > {
    try {
      const request = await this.requestsRepository.findById(
        id,
        new Types.ObjectId(businessId),
      );
      if (!request)
        return new NotFoundException(REQUESTS_MESSAGES.ERROR.NOT_FOUND);
      return request;
    } catch (error) {
      this.logger.error(
        `getRequest: unexpected error [id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createRequest(
    dto: CreateRequestDto,
    businessSlug?: string,
    businessId?: string,
  ): Promise<
    | ServiceRequest
    | BadRequestException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      let resolvedBusinessId: Types.ObjectId;

      if (businessId) {
        const business = await this.businessRepository.findById(businessId);
        if (!business || business.deletedAt) {
          return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
        }
        resolvedBusinessId = business._id;
      } else if (businessSlug) {
        const business =
          await this.businessRepository.findBySubdomain(businessSlug);
        if (!business) {
          return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
        }
        resolvedBusinessId = business._id;
      } else {
        return new BadRequestException(
          'businessSlug or businessId query param is required',
        );
      }

      const request = await this.requestsRepository.create({
        businessId: resolvedBusinessId,
        clientName: dto.clientName,
        clientEmail: dto.clientEmail,
        clientPhone: dto.clientPhone,
        service: dto.service,
        requestedDate: new Date(dto.requestedDate),
        message: dto.message,
      });

      await this.invalidateRequestsListCache(resolvedBusinessId.toString());
      return request;
    } catch (error) {
      this.logger.error(
        `createRequest: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async updateRequest(
    id: string,
    businessId: string,
    dto: UpdateRequestDto,
    actionedBy: string,
  ): Promise<
    | ServiceRequest
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.requestsRepository.findById(id, bId);

      if (!existing) {
        return new NotFoundException(REQUESTS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (dto.status && existing.status !== RequestStatus.PENDING) {
        return new BadRequestException(
          REQUESTS_MESSAGES.ERROR.ALREADY_ACTIONED,
        );
      }

      if (dto.status === RequestStatus.ACCEPTED) {
        const accepted = await this.acceptRequest(
          id,
          bId,
          existing,
          dto,
          actionedBy,
        );
        if (!(accepted instanceof InternalServerErrorException)) {
          await this.invalidateRequestsListCache(businessId);
        }
        return accepted;
      }

      const updated = await this.requestsRepository.updateById(id, bId, {
        ...(dto.status && {
          status: dto.status,
          actionedAt: new Date(),
          actionedBy: new Types.ObjectId(actionedBy),
        }),
        ...(dto.quotedPrice !== undefined && { quotedPrice: dto.quotedPrice }),
      });

      if (updated) {
        await this.invalidateRequestsListCache(businessId);
      }
      return updated!;
    } catch (error) {
      this.logger.error(
        `updateRequest: unexpected error [id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async deleteRequest(
    id: string,
    businessId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const deleted = await this.requestsRepository.softDelete(
        id,
        new Types.ObjectId(businessId),
      );
      if (!deleted)
        return new NotFoundException(REQUESTS_MESSAGES.ERROR.NOT_FOUND);
      await this.invalidateRequestsListCache(businessId);
      return null;
    } catch (error) {
      this.logger.error(
        `deleteRequest: unexpected error [id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async acceptRequest(
    id: string,
    bId: Types.ObjectId,
    existing: ServiceRequest,
    dto: UpdateRequestDto,
    actionedBy: string,
  ): Promise<ServiceRequest | InternalServerErrorException> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      let client = await this.clientsRepository.findByEmail(
        existing.clientEmail,
        bId,
      );

      if (!client) {
        client = await this.clientsRepository.create(
          {
            businessId: bId,
            name: existing.clientName,
            email: existing.clientEmail,
            phone: existing.clientPhone,
          },
          session,
        );
      }

      const updated = await this.requestsRepository.updateById(
        id,
        bId,
        {
          status: RequestStatus.ACCEPTED,
          clientId: client._id,
          actionedAt: new Date(),
          actionedBy: new Types.ObjectId(actionedBy),
          ...(dto.quotedPrice !== undefined && {
            quotedPrice: dto.quotedPrice,
          }),
        },
        session,
      );

      await session.commitTransaction();
      return updated!;
    } catch (err) {
      await session.abortTransaction();
      this.logger.error(
        `acceptRequest: transaction failed [id=${id}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  private async buildRequestsListCacheKey(
    businessId: string,
    dto: ListRequestsDto,
    page: number,
    limit: number,
  ): Promise<string | null> {
    try {
      const versionRaw = await this.redisService.get(
        requestsListVersionKey(businessId),
      );
      const version = Number.parseInt(versionRaw ?? '0', 10);
      const safeVersion = Number.isNaN(version) ? 0 : version;
      const status = dto.status ?? 'all';
      const search = encodeURIComponent((dto.search ?? '').toLowerCase());

      return `requests:list:${businessId}:v:${safeVersion}:p:${page}:l:${limit}:s:${status}:q:${search}`;
    } catch (error) {
      this.logger.warn(
        `buildRequestsListCacheKey: cache unavailable [businessId=${businessId}]: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async getCachedRequestsList(
    cacheKey: string | null,
  ): Promise<PaginatedRequests | null> {
    if (!cacheKey) return null;

    try {
      const cached = await this.redisService.get(cacheKey);
      if (!cached) return null;

      return JSON.parse(cached) as PaginatedRequests;
    } catch (error) {
      this.logger.warn(
        `getCachedRequestsList: cache read failed [key=${cacheKey}]: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async setCachedRequestsList(
    cacheKey: string | null,
    payload: PaginatedRequests,
  ): Promise<void> {
    if (!cacheKey) return;

    try {
      await this.redisService.set(
        cacheKey,
        JSON.stringify(payload),
        CACHE_TTL.REQUESTS_LIST,
      );
    } catch (error) {
      this.logger.warn(
        `setCachedRequestsList: cache write failed [key=${cacheKey}]: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async invalidateRequestsListCache(businessId: string): Promise<void> {
    try {
      const versionKey = requestsListVersionKey(businessId);
      await this.redisService.incr(versionKey);
      await this.redisService.expire(
        versionKey,
        CACHE_TTL.REQUESTS_LIST_VERSION,
      );
    } catch (error) {
      this.logger.warn(
        `invalidateRequestsListCache: cache invalidate failed [businessId=${businessId}]: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
