import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { generateStrongPassword, hashValue } from 'src/common/utils/hash.util';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { JOBS } from '../agenda/agenda.constants';
import { AgendaService } from '../agenda/agenda.service';
import { ClientCredentialsJobData } from '../agenda/jobs/email.jobs';
import { BusinessRepository } from '../business/business.repository';
import { RedisService } from '../redis/redis.service';
import { UserRole } from '../users/schemas/user.schema';
import { UsersRepository } from '../users/users.repository';
import { ClientsRepository } from './clients.repository';
import { CreateClientDto } from './dto/create-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client } from './schemas/client.schema';

interface PaginatedClients {
  data: Client[];
  meta: ReturnType<typeof buildMeta>;
}

const clientsListVersionKey = (businessId: string): string =>
  `${businessId}:clients:list:version`;

const clientsListCacheKey = (
  businessId: string,
  version: string,
  search: string,
  page: number,
  limit: number,
): string =>
  `${businessId}:clients:list:v${version}:s${search}:p${page}:l${limit}`;

const clientDetailCacheKey = (businessId: string, id: string): string =>
  `${businessId}:clients:${id}`;

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly clientsRepository: ClientsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly agendaService: AgendaService,
    private readonly redisService: RedisService,
  ) {}

  async listClients(
    businessId: string,
    dto: QueryClientsDto,
  ): Promise<PaginatedClients | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const version = await this.getListVersion(businessId);
      const cacheKey = clientsListCacheKey(
        businessId,
        version,
        dto.search ?? '',
        pagination.page,
        pagination.limit,
      );

      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as PaginatedClients;
      }

      const { data, total } = await this.clientsRepository.findAll(
        new Types.ObjectId(businessId),
        { search: dto.search },
        pagination,
      );

      const result: PaginatedClients = {
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.CLIENTS_LIST)
        .catch((err: unknown) =>
          this.logger.warn(
            `listClients: cache write failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return result;
    } catch (error) {
      this.logger.error(
        `listClients: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getClient(
    id: string,
    businessId: string,
  ): Promise<Client | NotFoundException | InternalServerErrorException> {
    try {
      const cacheKey = clientDetailCacheKey(businessId, id);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Client;
      }

      const client = await this.clientsRepository.findById(
        id,
        new Types.ObjectId(businessId),
      );

      if (!client)
        return new NotFoundException(CLIENTS_MESSAGES.ERROR.NOT_FOUND);

      await this.redisService
        .set(cacheKey, JSON.stringify(client), CACHE_TTL.CLIENT_DETAIL)
        .catch((err: unknown) =>
          this.logger.warn(
            `getClient: cache write failed [id=${id}]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return client;
    } catch (error) {
      this.logger.error(
        `getClient: unexpected error [id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Creates a new client and provisions their login credentials via a background job.
   *
   * Flow:
   *   1. Verify business exists and is active.
   *   2. Guard against duplicate email within the same business.
   *   3. Open a MongoDB session/transaction so the client record and user account
   *      are either both created or both rolled back.
   *   4. If no User account exists for the email, create one with a temporary
   *      password (mustChangePassword=true) and queue a credential email job.
   *   5. Invalidate the clients list cache.
   *
   * Example: POST /clients { name: "Jane Smith", email: "jane@example.com" }
   */
  async createClient(
    businessId: string,
    dto: CreateClientDto,
  ): Promise<
    | Client
    | ConflictException
    | NotFoundException
    | InternalServerErrorException
  > {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const bId = new Types.ObjectId(businessId);
      const [existing, business] = await Promise.all([
        this.clientsRepository.findByEmail(dto.email, bId),
        this.businessRepository.findById(businessId),
      ]);

      if (!business || business.deletedAt) {
        await session.abortTransaction();
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      if (existing) {
        await session.abortTransaction();
        return new ConflictException(CLIENTS_MESSAGES.ERROR.EMAIL_TAKEN);
      }

      let user = await this.usersRepository.findByEmail(dto.email);
      let temporaryPassword: string | null = null;

      if (!user) {
        temporaryPassword = generateStrongPassword();
        const passwordHash = await hashValue(temporaryPassword);
        const { firstName, lastName } = this.splitName(dto.name);

        try {
          user = await this.usersRepository.create(
            {
              firstName,
              lastName,
              email: dto.email,
              phone: dto.phone,
              passwordHash,
              userRole: UserRole.CLIENT,
              businessId: bId,
              isActive: true,
              isEmailVerified: true,
              mustChangePassword: true,
            },
            session,
          );
        } catch (err) {
          if (!this.isDuplicateKeyError(err)) throw err;
          // Another concurrent request created the user — fetch and reuse
          user = await this.usersRepository.findByEmail(dto.email);
          temporaryPassword = null;
        }
      }

      const client = await this.clientsRepository.create(
        {
          businessId: bId,
          userId: user?._id,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
        },
        session,
      );

      await session.commitTransaction();

      // Queue credential email outside the transaction — failure must not roll back the client
      if (temporaryPassword && user) {
        const { firstName } = this.splitName(dto.name);
        void this.agendaService
          .now<ClientCredentialsJobData>(JOBS.EMAIL_CLIENT_CREDENTIALS, {
            to: dto.email,
            firstName,
            businessName: business.name,
            temporaryPassword,
          })
          .catch((err: unknown) =>
            this.logger.error(
              `createClient: credential email job failed [businessId=${businessId}, email=${dto.email}]: ${err instanceof Error ? err.stack : String(err)}`,
            ),
          );
      }

      void this.invalidateClientsListCache(businessId);
      return client;
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(
        `createClient: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  async updateClient(
    id: string,
    businessId: string,
    dto: UpdateClientDto,
  ): Promise<
    | Client
    | NotFoundException
    | ConflictException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);

      if (dto.email) {
        const emailTaken = await this.clientsRepository.findByEmail(
          dto.email,
          bId,
        );
        if (emailTaken && emailTaken._id.toString() !== id) {
          return new ConflictException(CLIENTS_MESSAGES.ERROR.EMAIL_TAKEN);
        }
      }

      const updated = await this.clientsRepository.updateById(id, bId, dto);
      if (!updated)
        return new NotFoundException(CLIENTS_MESSAGES.ERROR.NOT_FOUND);

      void this.invalidateClientsListCache(businessId);
      await this.redisService
        .del(clientDetailCacheKey(businessId, id))
        .catch(() => undefined);

      return updated;
    } catch (error) {
      this.logger.error(
        `updateClient: unexpected error [id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async deleteClient(
    id: string,
    businessId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const deleted = await this.clientsRepository.softDelete(
        id,
        new Types.ObjectId(businessId),
      );

      if (!deleted)
        return new NotFoundException(CLIENTS_MESSAGES.ERROR.NOT_FOUND);

      void this.invalidateClientsListCache(businessId);
      await this.redisService
        .del(clientDetailCacheKey(businessId, id))
        .catch(() => undefined);

      return null;
    } catch (error) {
      this.logger.error(
        `deleteClient: unexpected error [id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async getListVersion(businessId: string): Promise<string> {
    try {
      const key = clientsListVersionKey(businessId);
      const version = await this.redisService.get(key);
      if (version) return version;

      await this.redisService.set(key, '1', CACHE_TTL.CLIENTS_LIST_VERSION);
      return '1';
    } catch {
      return '0';
    }
  }

  private async invalidateClientsListCache(businessId: string): Promise<void> {
    try {
      await this.redisService.incr(clientsListVersionKey(businessId));
    } catch (err) {
      this.logger.warn(
        `invalidateClientsListCache: failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private splitName(name: string): { firstName: string; lastName: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] ?? 'Client',
      lastName: parts.slice(1).join(' ') || 'User',
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }
}
