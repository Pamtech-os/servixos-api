import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { REQUESTS_MESSAGES } from 'src/common/constants/messages/requests.messages';
import { generateStrongPassword, hashValue } from 'src/common/utils/hash.util';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { JOBS } from '../agenda/agenda.constants';
import { AgendaService } from '../agenda/agenda.service';
import { ClientCredentialsJobData } from '../agenda/jobs/email.jobs';
import { BusinessRepository } from '../business/business.repository';
import { ClientsRepository } from '../clients/clients.repository';
import { RedisService } from '../redis/redis.service';
import { UserRole } from '../users/schemas/user.schema';
import { UsersRepository } from '../users/users.repository';
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

interface ClientProvisioningPayload {
  businessId: string;
  businessName: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
}

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly requestsRepository: RequestsRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly usersRepository: UsersRepository,
    private readonly agendaService: AgendaService,
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
      let resolvedBusinessName: string;

      if (businessId) {
        const business = await this.businessRepository.findById(businessId);
        if (!business || business.deletedAt) {
          return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
        }
        resolvedBusinessId = business._id;
        resolvedBusinessName = business.name;
      } else if (businessSlug) {
        const business =
          await this.businessRepository.findBySubdomain(businessSlug);
        if (!business) {
          return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
        }
        resolvedBusinessId = business._id;
        resolvedBusinessName = business.name;
      } else {
        return new BadRequestException(
          REQUESTS_MESSAGES.ERROR.MISSING_BUSINESS_IDENTIFIER,
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

      void this.provisionClientInBackground({
        businessId: resolvedBusinessId.toString(),
        businessName: resolvedBusinessName,
        clientName: dto.clientName,
        clientEmail: dto.clientEmail,
        clientPhone: dto.clientPhone,
      });

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
        if (
          !(
            accepted instanceof InternalServerErrorException ||
            accepted instanceof BadRequestException
          )
        ) {
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
  ): Promise<
    ServiceRequest | BadRequestException | InternalServerErrorException
  > {
    try {
      const client = await this.clientsRepository.findByEmail(
        existing.clientEmail.toLowerCase().trim(),
        bId,
      );
      if (!client) {
        return new BadRequestException(
          REQUESTS_MESSAGES.ERROR.CLIENT_NOT_PROVISIONED,
        );
      }

      const updated = await this.requestsRepository.updateById(id, bId, {
        status: RequestStatus.ACCEPTED,
        clientId: client._id,
        actionedAt: new Date(),
        actionedBy: new Types.ObjectId(actionedBy),
        ...(dto.quotedPrice !== undefined && {
          quotedPrice: dto.quotedPrice,
        }),
      });

      return updated!;
    } catch (err) {
      this.logger.error(
        `acceptRequest: unexpected error [id=${id}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
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

  private async provisionClientInBackground(
    payload: ClientProvisioningPayload,
  ): Promise<void> {
    await this.provisionClient(payload).catch((error: unknown) =>
      this.logger.error(
        `provisionClientInBackground: failed [businessId=${payload.businessId}, email=${payload.clientEmail}]: ${error instanceof Error ? error.stack : String(error)}`,
      ),
    );
  }

  private async provisionClient(
    payload: ClientProvisioningPayload,
  ): Promise<void> {
    const businessId = new Types.ObjectId(payload.businessId);
    const normalizedEmail = payload.clientEmail.toLowerCase().trim();
    const { firstName, lastName } = this.splitClientName(payload.clientName);
    const existingClient = await this.clientsRepository.findByEmail(
      normalizedEmail,
      businessId,
    );

    if (existingClient?.userId) {
      return;
    }

    let user = await this.usersRepository.findByEmail(normalizedEmail);
    let temporaryPassword: string | null = null;

    if (!user) {
      temporaryPassword = generateStrongPassword();
      const passwordHash = await hashValue(temporaryPassword);

      try {
        user = await this.usersRepository.create({
          firstName,
          lastName,
          email: normalizedEmail,
          phone: payload.clientPhone,
          passwordHash,
          userRole: UserRole.CLIENT,
          businessId,
          isActive: true,
          isEmailVerified: true,
          mustChangePassword: true,
        });
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) {
          throw error;
        }
        user = await this.usersRepository.findByEmail(normalizedEmail);
        temporaryPassword = null;
      }
    }

    if (!user) {
      this.logger.warn(
        `provisionClient: unable to resolve user after create [businessId=${payload.businessId}, email=${normalizedEmail}]`,
      );
      return;
    }

    if (!existingClient) {
      try {
        await this.clientsRepository.create({
          businessId,
          userId: user._id,
          name: payload.clientName,
          email: normalizedEmail,
          phone: payload.clientPhone,
        });
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) throw error;
      }
    } else if (!existingClient.userId) {
      await this.clientsRepository.attachUserIdIfMissing(
        normalizedEmail,
        businessId,
        user._id,
      );
    }

    if (!temporaryPassword) return;

    await this.agendaService
      .now<ClientCredentialsJobData>(JOBS.EMAIL_CLIENT_CREDENTIALS, {
        to: normalizedEmail,
        firstName,
        businessName: payload.businessName,
        temporaryPassword,
      })
      .catch((error: unknown) =>
        this.logger.error(
          `provisionClient: credentials email job failed [businessId=${payload.businessId}, email=${normalizedEmail}]: ${error instanceof Error ? error.stack : String(error)}`,
        ),
      );
  }

  private splitClientName(name: string): {
    firstName: string;
    lastName: string;
  } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? 'Client';
    const lastName = parts.slice(1).join(' ') || 'User';
    return { firstName, lastName };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: number }).code === 11000
    );
  }
}
