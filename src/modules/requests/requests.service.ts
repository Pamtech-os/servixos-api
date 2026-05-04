import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { Job } from 'agenda';
import { Types } from 'mongoose';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { REQUESTS_MESSAGES } from 'src/common/constants/messages/requests.messages';
import { generateStrongPassword, hashValue } from 'src/common/utils/hash.util';
import { toTwoDecimal } from 'src/common/utils/number.util';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { JOBS } from '../agenda/agenda.constants';
import { AgendaService } from '../agenda/agenda.service';
import { ClientCredentialsJobData } from '../agenda/jobs/email.jobs';
import { BusinessRepository } from '../business/business.repository';
import { ClientsRepository } from '../clients/clients.repository';
import { AcceptedRequestJobCreationData } from '../jobs/jobs.types';
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
const requestCreateIdempotencyKey = (
  businessId: string,
  idempotencyKey: string,
): string => `requests:create:idempotency:${businessId}:${idempotencyKey}`;
const requestBusinessSlugCacheKey = (slug: string): string =>
  `requests:business:slug:${slug}`;
const IDEMPOTENCY_PENDING_PREFIX = 'pending:';
const IDEMPOTENCY_DONE_PREFIX = 'done:';
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const IDEMPOTENCY_WAIT_ATTEMPTS = 15;
const IDEMPOTENCY_WAIT_INTERVAL_MS = 80;
const PROVISION_RETRY_BASE_DELAY_MS = 5_000;
const PROVISION_RETRY_MAX_DELAY_MS = 60_000;
const PROVISION_RETRY_MAX_ATTEMPTS = 4;

interface ClientProvisioningPayload {
  businessId: string;
  businessName: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
}

export interface ClientProvisioningJobData extends ClientProvisioningPayload {
  attempt?: number;
}

interface ResolvedBusinessContext {
  businessId: Types.ObjectId;
  businessName: string;
}

interface PriceEstimateContext {
  businessName: string;
  businessCategory: string;
  service: string;
  clientMessage?: string;
  requestedDate: Date;
  currency: string;
}

export interface PriceEstimateResult {
  suggestedPrice: number;
  lowPrice: number;
  highPrice: number;
  confidence: 'low' | 'medium' | 'high';
  currency: string;
  reasoning: string;
}

@Injectable()
export class RequestsService implements OnModuleInit {
  private readonly logger = new Logger(RequestsService.name);
  private readonly anthropic: Anthropic;
  private readonly pricingModel: string;
  private readonly currency: string;

  constructor(
    config: ConfigService,
    private readonly requestsRepository: RequestsRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly usersRepository: UsersRepository,
    private readonly agendaService: AgendaService,
    private readonly redisService: RedisService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: config.get<string>('ANTHROPIC_API_KEY'),
    });
    this.pricingModel = config.get<string>('AI_PRICING_MODEL') ?? '';
    this.currency = config.get<string>('DEFAULT_CURRENCY') ?? 'USD';
  }

  onModuleInit(): void {
    this.agendaService.define(
      JOBS.REQUEST_CLIENT_PROVISION,
      async (job: Job): Promise<void> => {
        const payload = job.attrs.data as ClientProvisioningJobData | undefined;
        if (!payload) {
          this.logger.warn(
            `${JOBS.REQUEST_CLIENT_PROVISION}: missing job payload`,
          );
          return;
        }

        await this.handleClientProvisioningJob(payload);
      },
    );
  }

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
      if (cached) {
        return {
          ...cached,
          data: cached.data.map((request) =>
            this.ensureAiEstimateFlag(request),
          ),
        };
      }

      const { data, total, statistics } = await this.requestsRepository.findAll(
        new Types.ObjectId(businessId),
        { status: dto.status, search: dto.search },
        pagination,
      );
      const result: PaginatedRequests = {
        data: data.map((request) => this.ensureAiEstimateFlag(request)),
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
      return this.ensureAiEstimateFlag(request);
    } catch (error) {
      this.logger.error(
        `getRequest: unexpected error [id=${id}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async estimateRequestPrice(
    id: string,
    businessId: string,
  ): Promise<
    | PriceEstimateResult
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const request = await this.requestsRepository.findById(id, bId);
      if (!request) {
        return new NotFoundException(REQUESTS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (request.aiPriceEstimate) {
        if (!request.hasAiPriceEstimate) {
          await this.requestsRepository.updateById(id, bId, {
            hasAiPriceEstimate: true,
            aiPriceEstimatedAt: request.aiPriceEstimatedAt ?? new Date(),
          });
        }
        return request.aiPriceEstimate;
      }

      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const estimate = await this.generateAiPriceEstimate({
        businessName: business.name,
        businessCategory: business.categoryName,
        service: request.service,
        clientMessage: request.message,
        requestedDate: request.requestedDate,
        currency: this.currency,
      });

      if (!estimate) {
        return new InternalServerErrorException(
          AI_MESSAGES.ERROR.AI_UNAVAILABLE,
        );
      }

      await this.requestsRepository.updateById(id, bId, {
        aiPriceEstimate: estimate,
        hasAiPriceEstimate: true,
        aiPriceEstimatedAt: new Date(),
      });

      return estimate;
    } catch (error) {
      this.logger.error(
        `estimateRequestPrice: unexpected error [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createRequest(
    dto: CreateRequestDto,
    businessSlug?: string,
    businessId?: string,
    idempotencyKey?: string,
  ): Promise<
    | ServiceRequest
    | BadRequestException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const normalizedIdempotencyKey =
        this.normalizeIdempotencyKey(idempotencyKey);
      if (idempotencyKey !== undefined && !normalizedIdempotencyKey) {
        return new BadRequestException(
          REQUESTS_MESSAGES.ERROR.INVALID_IDEMPOTENCY_KEY,
        );
      }

      const resolved = await this.resolveBusinessContext(
        businessSlug,
        businessId,
      );
      if (resolved instanceof BadRequestException) return resolved;
      if (resolved instanceof NotFoundException) return resolved;

      if (!normalizedIdempotencyKey) {
        const created = await this.createRequestRecordAndQueueProvisioning(
          dto,
          resolved.businessId,
          resolved.businessName,
        );
        return this.ensureAiEstimateFlag(created);
      }

      const createdOrExisting = await this.createRequestWithIdempotency(
        dto,
        resolved.businessId,
        resolved.businessName,
        normalizedIdempotencyKey,
      );
      if (
        createdOrExisting instanceof BadRequestException ||
        createdOrExisting instanceof NotFoundException ||
        createdOrExisting instanceof InternalServerErrorException
      ) {
        return createdOrExisting;
      }
      return this.ensureAiEstimateFlag(createdOrExisting);
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

      /*
       * Only "pending" requests can be changed.
       * Example: if a request is already accepted/rejected/cancelled, we block further edits.
       */
      if (dto.status && existing.status !== RequestStatus.PENDING) {
        return new BadRequestException(
          REQUESTS_MESSAGES.ERROR.ALREADY_ACTIONED,
        );
      }

      if (dto.status === RequestStatus.ACCEPTED) {
        const acceptanceError = this.validateAcceptanceDetails(dto);
        if (acceptanceError) {
          return acceptanceError;
        }

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
          void this.invalidateRequestsListCache(businessId);
          void this.queueAcceptedRequestJobCreation(accepted, businessId);
          return this.ensureAiEstimateFlag(accepted);
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
        void this.invalidateRequestsListCache(businessId);
        return this.ensureAiEstimateFlag(updated);
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
      void this.invalidateRequestsListCache(businessId);
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
        quotedPrice: dto.quotedPrice,
        startDate: new Date(dto.startDate!),
        endDate: new Date(dto.endDate!),
      });

      return updated!;
    } catch (err) {
      this.logger.error(
        `acceptRequest: unexpected error [id=${id}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private validateAcceptanceDetails(
    dto: UpdateRequestDto,
  ): BadRequestException | null {
    if (dto.quotedPrice === undefined || !dto.startDate || !dto.endDate) {
      return new BadRequestException(
        REQUESTS_MESSAGES.ERROR.ACCEPTANCE_DETAILS_REQUIRED,
      );
    }

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (end.getTime() < start.getTime()) {
      return new BadRequestException(
        REQUESTS_MESSAGES.ERROR.ACCEPTANCE_DATE_RANGE_INVALID,
      );
    }

    return null;
  }

  private ensureAiEstimateFlag(request: ServiceRequest): ServiceRequest {
    return {
      ...request,
      hasAiPriceEstimate:
        request.hasAiPriceEstimate ?? Boolean(request.aiPriceEstimate),
    };
  }

  private async queueAcceptedRequestJobCreation(
    acceptedRequest: ServiceRequest,
    businessId: string,
  ): Promise<void> {
    try {
      if (!acceptedRequest.clientId) {
        return;
      }

      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        return;
      }

      const payload: AcceptedRequestJobCreationData = {
        businessId,
        sourceRequestId: acceptedRequest._id.toString(),
        clientId: acceptedRequest.clientId.toString(),
        title: acceptedRequest.service,
        description: acceptedRequest.message,
        scheduledDate: (
          acceptedRequest.startDate ?? acceptedRequest.requestedDate
        ).toISOString(),
        price: acceptedRequest.quotedPrice,
        notes: acceptedRequest.endDate
          ? `Accepted schedule window ends on ${acceptedRequest.endDate.toISOString()}.`
          : undefined,
        timezone: business.timezone,
      };

      await this.agendaService.now<AcceptedRequestJobCreationData>(
        JOBS.REQUEST_ACCEPTED_CREATE_JOB,
        payload,
      );
    } catch (error) {
      this.logger.error(
        `queueAcceptedRequestJobCreation: failed [requestId=${acceptedRequest._id.toString()}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
    }
  }

  private async createRequestWithIdempotency(
    dto: CreateRequestDto,
    businessId: Types.ObjectId,
    businessName: string,
    idempotencyKey: string,
  ): Promise<
    | ServiceRequest
    | BadRequestException
    | InternalServerErrorException
    | NotFoundException
  > {
    const businessIdStr = businessId.toString();
    const cacheKey = requestCreateIdempotencyKey(businessIdStr, idempotencyKey);

    const existing = await this.resolveIdempotentRequest(cacheKey, businessId);
    if (existing) return existing;

    /*
     * This lock avoids accidental duplicates.
     * Example: user double-clicks "Submit" or retries on bad network -> still one request record.
     */
    const lockToken = `${IDEMPOTENCY_PENDING_PREFIX}${Date.now()}:${Math.random()
      .toString(36)
      .slice(2)}`;

    const lockAcquired = await this.redisService.setIfAbsent(
      cacheKey,
      lockToken,
      CACHE_TTL.REQUEST_CREATE_IDEMPOTENCY_PENDING,
    );

    if (!lockAcquired) {
      const replayed = await this.waitForIdempotentResult(cacheKey, businessId);
      if (replayed) return replayed;
      return new BadRequestException(
        REQUESTS_MESSAGES.ERROR.IDEMPOTENCY_IN_PROGRESS,
      );
    }

    try {
      const created = await this.createRequestRecordAndQueueProvisioning(
        dto,
        businessId,
        businessName,
      );
      await this.redisService.set(
        cacheKey,
        `${IDEMPOTENCY_DONE_PREFIX}${created._id.toString()}`,
        CACHE_TTL.REQUEST_CREATE_IDEMPOTENCY_RESULT,
      );
      return created;
    } catch (error) {
      const current = await this.redisService.get(cacheKey);
      if (current === lockToken) {
        await this.redisService.del(cacheKey);
      }
      throw error;
    }
  }

  private async createRequestRecordAndQueueProvisioning(
    dto: CreateRequestDto,
    businessId: Types.ObjectId,
    businessName: string,
  ): Promise<ServiceRequest> {
    const normalizedEmail = dto.clientEmail.toLowerCase().trim();

    await this.clientsRepository.upsertFromRequest({
      businessId,
      name: dto.clientName,
      email: normalizedEmail,
      phone: dto.clientPhone,
    });

    const request = await this.requestsRepository.create({
      businessId,
      clientName: dto.clientName,
      clientEmail: normalizedEmail,
      clientPhone: dto.clientPhone,
      service: dto.service,
      requestedDate: new Date(dto.requestedDate),
      message: dto.message,
    });

    // Cache invalidation should never block request submission latency.
    void this.invalidateRequestsListCache(businessId.toString());

    void this.enqueueClientProvisioningJob({
      businessId: businessId.toString(),
      businessName,
      clientName: dto.clientName,
      clientEmail: normalizedEmail,
      clientPhone: dto.clientPhone,
    });

    return request;
  }

  async handleClientProvisioningJob(
    payload: ClientProvisioningJobData,
  ): Promise<void> {
    if (
      !payload.businessId ||
      !payload.businessName ||
      !payload.clientName ||
      !payload.clientEmail
    ) {
      this.logger.warn(
        `handleClientProvisioningJob: invalid payload ${JSON.stringify(payload)}`,
      );
      return;
    }

    const attempt = payload.attempt ?? 0;

    try {
      await this.provisionClient(payload);
    } catch (error) {
      const nextAttempt = attempt + 1;
      if (nextAttempt > PROVISION_RETRY_MAX_ATTEMPTS) {
        this.logger.error(
          `handleClientProvisioningJob: retries exhausted [businessId=${payload.businessId}, email=${payload.clientEmail}, attempt=${attempt}] ${error instanceof Error ? error.stack : String(error)}`,
        );
        return;
      }

      /*
       * Each retry waits longer than the previous one.
       * Example: 1st retry waits 5s, then 10s, then 20s, then 40s (max window capped).
       */
      const delayMs = Math.min(
        PROVISION_RETRY_BASE_DELAY_MS * 2 ** (nextAttempt - 1),
        PROVISION_RETRY_MAX_DELAY_MS,
      );

      await this.agendaService
        .schedule(
          new Date(Date.now() + delayMs),
          JOBS.REQUEST_CLIENT_PROVISION,
          {
            ...payload,
            attempt: nextAttempt,
          },
        )
        .then(() =>
          this.logger.warn(
            `handleClientProvisioningJob: scheduled retry [businessId=${payload.businessId}, email=${payload.clientEmail}, attempt=${nextAttempt}, delayMs=${delayMs}]`,
          ),
        )
        .catch((scheduleError: unknown) =>
          this.logger.error(
            `handleClientProvisioningJob: failed to schedule retry [businessId=${payload.businessId}, email=${payload.clientEmail}, attempt=${nextAttempt}] ${scheduleError instanceof Error ? scheduleError.stack : String(scheduleError)}`,
          ),
        );
    }
  }

  private async enqueueClientProvisioningJob(
    payload: ClientProvisioningPayload,
  ): Promise<void> {
    await this.agendaService
      .now<ClientProvisioningJobData>(JOBS.REQUEST_CLIENT_PROVISION, {
        ...payload,
        attempt: 0,
      })
      .catch((error: unknown) =>
        this.logger.error(
          `enqueueClientProvisioningJob: failed [businessId=${payload.businessId}, email=${payload.clientEmail}] ${error instanceof Error ? error.stack : String(error)}`,
        ),
      );
  }

  private async resolveBusinessContext(
    businessSlug?: string,
    businessId?: string,
  ): Promise<
    ResolvedBusinessContext | BadRequestException | NotFoundException
  > {
    const normalizedBusinessId = businessId?.trim();
    const normalizedBusinessSlug = businessSlug?.trim().toLowerCase();
    const hasBusinessId = Boolean(normalizedBusinessId);
    const hasBusinessSlug = Boolean(normalizedBusinessSlug);

    /*
     * Caller must choose one business identifier only.
     * Example: send "businessSlug=acme-cleaning" OR "businessId=664..." but not both together.
     */
    if (hasBusinessId && hasBusinessSlug) {
      return new BadRequestException(
        REQUESTS_MESSAGES.ERROR.MULTIPLE_BUSINESS_IDENTIFIERS,
      );
    }

    if (!hasBusinessId && !hasBusinessSlug) {
      return new BadRequestException(
        REQUESTS_MESSAGES.ERROR.MISSING_BUSINESS_IDENTIFIER,
      );
    }

    if (hasBusinessSlug) {
      const resolved = await this.resolveBusinessBySlugWithCache(
        normalizedBusinessSlug as string,
      );
      if (!resolved) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      return resolved;
    }

    const business = await this.businessRepository.findById(
      normalizedBusinessId as string,
    );
    if (!business || business.deletedAt) {
      return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
    }

    return {
      businessId: business._id,
      businessName: business.name,
    };
  }

  private async resolveBusinessBySlugWithCache(
    businessSlug: string,
  ): Promise<ResolvedBusinessContext | null> {
    const cacheKey = requestBusinessSlugCacheKey(businessSlug);

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { id: string; name: string };
        if (
          Types.ObjectId.isValid(parsed.id) &&
          typeof parsed.name === 'string' &&
          parsed.name.length > 0
        ) {
          return {
            businessId: new Types.ObjectId(parsed.id),
            businessName: parsed.name,
          };
        }
      }
    } catch (error) {
      this.logger.warn(
        `resolveBusinessBySlugWithCache: cache read failed [slug=${businessSlug}] ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const business =
      await this.businessRepository.findBySubdomain(businessSlug);
    if (!business) return null;

    await this.redisService
      .set(
        cacheKey,
        JSON.stringify({
          id: business._id.toString(),
          name: business.name,
        }),
        CACHE_TTL.REQUEST_BUSINESS_SLUG,
      )
      .catch((error: unknown) =>
        this.logger.warn(
          `resolveBusinessBySlugWithCache: cache write failed [slug=${businessSlug}] ${error instanceof Error ? error.message : String(error)}`,
        ),
      );

    return {
      businessId: business._id,
      businessName: business.name,
    };
  }

  private async generateAiPriceEstimate(
    context: PriceEstimateContext,
  ): Promise<PriceEstimateResult | null> {
    try {
      const message = await this.anthropic.messages.create({
        model: this.pricingModel,
        max_tokens: 700,
        messages: [
          {
            role: 'user',
            content: this.buildPricePrompt(context),
          },
        ],
      });

      const textBlock = message.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') return null;

      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as Partial<PriceEstimateResult>;
      if (
        typeof parsed.suggestedPrice !== 'number' ||
        typeof parsed.lowPrice !== 'number' ||
        typeof parsed.highPrice !== 'number' ||
        typeof parsed.reasoning !== 'string' ||
        parsed.suggestedPrice <= 0 ||
        parsed.lowPrice <= 0 ||
        parsed.highPrice <= 0
      ) {
        return null;
      }

      const confidence =
        parsed.confidence === 'low' ||
        parsed.confidence === 'medium' ||
        parsed.confidence === 'high'
          ? parsed.confidence
          : 'medium';

      const lowPrice = Math.min(parsed.lowPrice, parsed.highPrice);
      const highPrice = Math.max(parsed.lowPrice, parsed.highPrice);
      const suggestedPrice = Math.min(
        Math.max(parsed.suggestedPrice, lowPrice),
        highPrice,
      );

      return {
        suggestedPrice: toTwoDecimal(suggestedPrice),
        lowPrice: toTwoDecimal(lowPrice),
        highPrice: toTwoDecimal(highPrice),
        confidence,
        currency: context.currency,
        reasoning: parsed.reasoning.trim(),
      };
    } catch (error) {
      this.logger.error(
        `generateAiPriceEstimate: AI estimation failed: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return null;
    }
  }

  private buildPricePrompt(context: PriceEstimateContext): string {
    const details = context.clientMessage
      ? `Client message: ${context.clientMessage}`
      : 'Client message: none provided.';

    return `You are a pricing analyst for small service businesses.
Estimate a fair market price for the service request below so the business avoids undercharging or overcharging.

Business name: ${context.businessName}
Business category: ${context.businessCategory}
Requested service: ${context.service}
Requested date: ${context.requestedDate.toISOString()}
${details}
Currency: ${context.currency}

Return ONLY a valid JSON object with exactly this shape:
{
  "suggestedPrice": 0,
  "lowPrice": 0,
  "highPrice": 0,
  "confidence": "low|medium|high",
  "reasoning": ""
}

Rules:
- suggestedPrice must be between lowPrice and highPrice.
- All price values must be positive numbers.
- Keep reasoning concise (1-3 sentences) and practical.`;
  }

  private normalizeIdempotencyKey(idempotencyKey?: string): string | undefined {
    if (idempotencyKey === undefined) return undefined;

    const normalized = idempotencyKey.trim();
    if (!normalized || normalized.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      return undefined;
    }
    return normalized;
  }

  private async resolveIdempotentRequest(
    cacheKey: string,
    businessId: Types.ObjectId,
  ): Promise<ServiceRequest | null> {
    const raw = await this.redisService.get(cacheKey);
    if (!raw) return null;

    const id = raw.startsWith(IDEMPOTENCY_DONE_PREFIX)
      ? raw.slice(IDEMPOTENCY_DONE_PREFIX.length)
      : raw;

    if (id.startsWith(IDEMPOTENCY_PENDING_PREFIX)) return null;
    if (!Types.ObjectId.isValid(id)) return null;

    return this.requestsRepository.findById(id, businessId);
  }

  private async waitForIdempotentResult(
    cacheKey: string,
    businessId: Types.ObjectId,
  ): Promise<ServiceRequest | null> {
    for (let attempt = 0; attempt < IDEMPOTENCY_WAIT_ATTEMPTS; attempt += 1) {
      const request = await this.resolveIdempotentRequest(cacheKey, businessId);
      if (request) return request;
      await this.sleep(IDEMPOTENCY_WAIT_INTERVAL_MS);
    }

    return null;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
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
