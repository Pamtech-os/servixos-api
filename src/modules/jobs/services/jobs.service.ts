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
import { Job as AgendaJob } from 'agenda';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { PdfService } from 'src/modules/pdf/pdf.service';
import { StorageService } from 'src/modules/storage/storage.service';
import { STORAGE_FOLDERS } from 'src/modules/storage/constants/storage-folders.constants';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { JOBS_MESSAGES } from 'src/common/constants/messages/jobs.messages';
import { buildMeta } from 'src/common/utils/pagination.util';
import { toBusinessLocalTime } from 'src/common/utils/timezone.util';
import { toTwoDecimal } from 'src/common/utils/number.util';
import { JOBS } from 'src/common/constants/agenda.constants';
import { AgendaService } from '../../agenda/services/agenda.service';
import { BusinessRepository } from '../../business/repositories/business.repository';
import type { Business } from '../../business/schemas/business.schema';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { contractClientTemplate } from '../../email/templates/contract-client.template';
import { EmailService } from '../../email/services/email.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { PaymentsService } from '../../payments/services/payments.service';
import { RedisService } from '../../redis/services/redis.service';
import { ContractsRepository } from '../../contracts/repositories/contracts.repository';
import { CreateJobDto } from '../dto/create-job.dto';
import { ListJobsDto } from '../dto/list-jobs.dto';
import { UpdateJobDto } from '../dto/update-job.dto';
import { JobsRepository } from '../repositories/jobs.repository';
import {
  AcceptedRequestJobCreationData,
  ContractSendJobData,
} from '../types/jobs.types';
import {
  Contract,
  ContractStatus,
} from '../../contracts/schemas/contract.schema';
import { Job, JobStatus } from '../schemas/job.schema';

interface JobClientPreview {
  _id: Types.ObjectId;
  name: string;
  email: string;
}

interface PaginatedJobs {
  data: Job[];
  meta: ReturnType<typeof buildMeta>;
}

interface ContractUploadResult {
  secureUrl: string;
  publicId: string;
}

export interface ContractGenerateResult {
  contractId: string;
  pdfUrl: string | null;
  /** Present only when PDF generation failed; frontend can render this directly for preview/editing. */
  html: string | null;
}

const JOBS_LIST_DEFAULT_LIMIT = 8;
const JOBS_LIST_MAX_LIMIT = 50;
const CLIENT_APP_CONTRACT_TTL_SECONDS = 60 * 60 * 24 * 30;

const jobsListVersionKey = (businessId: string): string =>
  `${businessId}:jobs:list:version`;
const jobsListCacheKey = (businessId: string, paramsHash: string): string =>
  `${businessId}:jobs:list:${paramsHash}`;
const jobDetailCacheKey = (businessId: string, id: string): string =>
  `${businessId}:jobs:${id}`;
const clientAppContractKey = (clientId: string, contractId: string): string =>
  `client:contracts:${clientId}:${contractId}`;

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private readonly appUrl: string;
  private readonly clientAppUrl: string;
  private readonly anthropic: Anthropic;
  private readonly contractModel: string;

  constructor(
    config: ConfigService,
    private readonly jobsRepository: JobsRepository,
    private readonly contractsRepository: ContractsRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly agendaService: AgendaService,
    private readonly redisService: RedisService,
    private readonly emailService: EmailService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly storageService: StorageService,
    private readonly pdfService: PdfService,
  ) {
    this.appUrl = config.get<string>('APP_URL') ?? 'http://localhost:3000';
    this.clientAppUrl =
      config.get<string>('CLIENT_APP_URL') ?? `${this.appUrl}/client`;
    this.anthropic = new Anthropic({
      apiKey: config.get<string>('ANTHROPIC_API_KEY'),
    });
    this.contractModel =
      config.get<string>('AI_CONTRACT_MODEL') ?? 'claude-opus-4-7';
  }

  onModuleInit(): void {
    this.agendaService.define(
      JOBS.REQUEST_ACCEPTED_CREATE_JOB,
      async (job: AgendaJob): Promise<void> => {
        const payload = job.attrs.data as AcceptedRequestJobCreationData;
        await this.handleAcceptedRequestJobCreation(payload);
      },
    );

    this.agendaService.define(
      JOBS.JOB_CONTRACT_SEND,
      async (job: AgendaJob): Promise<void> => {
        const payload = job.attrs.data as ContractSendJobData;
        await this.handleContractSendJob(payload);
      },
    );
  }

  async listJobs(
    businessId: string,
    dto: ListJobsDto,
  ): Promise<PaginatedJobs | InternalServerErrorException> {
    try {
      const { page, limit, skip } = this.resolveJobsPagination(
        dto.page,
        dto.limit,
      );
      const cacheKey = await this.buildJobsListCacheKey(businessId, {
        page,
        limit,
        search: dto.search,
        clientId: dto.clientId,
        status: dto.status,
      });

      const cached = await this.getCachedJobsList(cacheKey);
      if (cached) return cached;

      const { data, total } = await this.jobsRepository.findAll(
        new Types.ObjectId(businessId),
        {
          search: dto.search,
          clientId: dto.clientId,
          status: dto.status,
        },
        { page, limit, skip },
      );

      const result: PaginatedJobs = {
        data,
        meta: buildMeta(page, limit, total),
      };

      await this.setCachedJobsList(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.error(
        `listJobs: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getJob(
    id: string,
    businessId: string,
  ): Promise<Job | NotFoundException | InternalServerErrorException> {
    try {
      const cacheKey = jobDetailCacheKey(businessId, id);
      const cached = await this.getCachedJobDetail(cacheKey);
      if (cached) return cached;

      const job = await this.jobsRepository.findById(
        id,
        new Types.ObjectId(businessId),
        true,
      );
      if (!job) {
        return new NotFoundException(JOBS_MESSAGES.ERROR.NOT_FOUND);
      }

      await this.setCachedJobDetail(cacheKey, job);
      return job;
    } catch (error) {
      this.logger.error(
        `getJob: unexpected error [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createJob(
    businessId: string,
    dto: CreateJobDto,
  ): Promise<
    Job | BadRequestException | NotFoundException | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const [client, business] = await Promise.all([
        this.clientsRepository.findById(dto.clientId, bId),
        this.businessRepository.findById(businessId),
      ]);

      if (!client) {
        return new BadRequestException(JOBS_MESSAGES.ERROR.CLIENT_NOT_FOUND);
      }

      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const created = await this.jobsRepository.create({
        businessId: bId,
        clientId: client._id,
        title: dto.title,
        description: dto.description,
        scheduledDate: new Date(dto.scheduledDate),
        location: dto.location,
        price: dto.price,
        notes: dto.notes,
        timezone: business.timezone,
      });

      void this.invalidateJobsListCache(businessId);
      await this.setCachedJobDetail(
        jobDetailCacheKey(businessId, created._id.toString()),
        created,
      );

      return created;
    } catch (error) {
      this.logger.error(
        `createJob: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async updateJob(
    id: string,
    businessId: string,
    dto: UpdateJobDto,
  ): Promise<
    Job | NotFoundException | BadRequestException | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.jobsRepository.findById(id, bId);
      if (!existing) {
        return new NotFoundException(JOBS_MESSAGES.ERROR.NOT_FOUND);
      }

      const update: Partial<Job> = {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.scheduledDate !== undefined && {
          scheduledDate: new Date(dto.scheduledDate),
        }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      };

      const updated = await this.jobsRepository.updateById(id, bId, update);
      if (!updated) {
        return new NotFoundException(JOBS_MESSAGES.ERROR.NOT_FOUND);
      }

      void this.invalidateJobsListCache(businessId);
      await this.setCachedJobDetail(jobDetailCacheKey(businessId, id), updated);

      return updated;
    } catch (error) {
      this.logger.error(
        `updateJob: unexpected error [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async startJob(
    id: string,
    businessId: string,
  ): Promise<
    Job | NotFoundException | BadRequestException | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.jobsRepository.findById(id, bId);
      if (!existing) {
        return new NotFoundException(JOBS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (existing.status === JobStatus.IN_PROGRESS) {
        return existing;
      }
      if (existing.status !== JobStatus.PENDING) {
        return new BadRequestException(JOBS_MESSAGES.ERROR.START_NOT_ALLOWED);
      }

      const contract = await this.contractsRepository.findByJobId(
        existing._id,
        bId,
      );
      if (!contract || contract.status !== ContractStatus.SIGNED) {
        return new BadRequestException(JOBS_MESSAGES.ERROR.CONTRACT_NOT_SIGNED);
      }

      const baselineAmount =
        typeof existing.price === 'number' && existing.price > 0
          ? existing.price
          : null;
      if (baselineAmount === null) {
        return new BadRequestException(
          JOBS_MESSAGES.ERROR.PRICE_REQUIRED_TO_START,
        );
      }

      const [paidSummary, directPaid] = await Promise.all([
        this.invoicesService.getPaidSummaryForJob(businessId, id),
        this.paymentsService.getSumDirectForJob(businessId, id),
      ]);
      if (paidSummary instanceof InternalServerErrorException) {
        return paidSummary;
      }
      if (directPaid instanceof InternalServerErrorException) {
        return directPaid;
      }

      const totalPaid = toTwoDecimal(paidSummary.amountPaid + directPaid);
      const minimumDeposit = toTwoDecimal(baselineAmount * 0.5);
      if (totalPaid + 0.000001 < minimumDeposit) {
        return new BadRequestException(
          JOBS_MESSAGES.ERROR.DEPOSIT_REQUIRED_TO_START,
        );
      }

      /*
       * Compare-and-set transition for race safety:
       * two devices can call "start" at nearly the same time; exactly one write
       * moves the record from pending -> in_progress, and retries become safe reads.
       */
      const startedAt = toBusinessLocalTime(new Date(), existing.timezone);
      const started = await this.jobsRepository.transitionStatusById(
        id,
        bId,
        [JobStatus.PENDING],
        {
          status: JobStatus.IN_PROGRESS,
          startedAt,
          completedAt: undefined,
        },
      );

      if (!started) {
        const latest = await this.jobsRepository.findById(id, bId);
        if (!latest) {
          return new NotFoundException(JOBS_MESSAGES.ERROR.NOT_FOUND);
        }
        if (latest.status === JobStatus.IN_PROGRESS) {
          return latest;
        }
        return new BadRequestException(JOBS_MESSAGES.ERROR.START_NOT_ALLOWED);
      }

      void this.invalidateJobsListCache(businessId);
      await this.setCachedJobDetail(jobDetailCacheKey(businessId, id), started);
      return started;
    } catch (error) {
      this.logger.error(
        `startJob: failed [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async completeJob(
    id: string,
    businessId: string,
  ): Promise<
    Job | NotFoundException | BadRequestException | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.jobsRepository.findById(id, bId);
      if (!existing) {
        return new NotFoundException(JOBS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (existing.status === JobStatus.COMPLETED) {
        return existing;
      }
      if (existing.status !== JobStatus.IN_PROGRESS) {
        return new BadRequestException(
          JOBS_MESSAGES.ERROR.COMPLETE_NOT_ALLOWED,
        );
      }

      const completedAt = toBusinessLocalTime(new Date(), existing.timezone);
      const completed = await this.jobsRepository.transitionStatusById(
        id,
        bId,
        [JobStatus.IN_PROGRESS],
        {
          status: JobStatus.COMPLETED,
          startedAt: existing.startedAt ?? completedAt,
          completedAt,
        },
      );

      if (!completed) {
        const latest = await this.jobsRepository.findById(id, bId);
        if (!latest) {
          return new NotFoundException(JOBS_MESSAGES.ERROR.NOT_FOUND);
        }
        if (latest.status === JobStatus.COMPLETED) {
          return latest;
        }
        return new BadRequestException(
          JOBS_MESSAGES.ERROR.COMPLETE_NOT_ALLOWED,
        );
      }

      void this.invalidateJobsListCache(businessId);
      await this.setCachedJobDetail(
        jobDetailCacheKey(businessId, id),
        completed,
      );
      return completed;
    } catch (error) {
      this.logger.error(
        `completeJob: failed [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async deleteJob(
    id: string,
    businessId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const deleted = await this.jobsRepository.softDelete(
        id,
        new Types.ObjectId(businessId),
      );
      if (!deleted) {
        return new NotFoundException(JOBS_MESSAGES.ERROR.NOT_FOUND);
      }

      void this.invalidateJobsListCache(businessId);
      await this.redisService.del(jobDetailCacheKey(businessId, id));
      return null;
    } catch (error) {
      this.logger.error(
        `deleteJob: unexpected error [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async bulkDeleteJobs(
    businessId: string,
    ids: string[],
  ): Promise<
    | { deletedCount: number }
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const deduped = Array.from(new Set(ids));
      if (deduped.length === 0) {
        return new BadRequestException(
          JOBS_MESSAGES.VALIDATION.IDS_ARRAY_REQUIRED,
        );
      }

      const deletedCount = await this.jobsRepository.softDeleteMany(
        deduped,
        new Types.ObjectId(businessId),
      );

      void this.invalidateJobsListCache(businessId);
      await Promise.all(
        deduped.map((id) =>
          this.redisService.del(jobDetailCacheKey(businessId, id)),
        ),
      );

      return { deletedCount };
    } catch (error) {
      this.logger.error(
        `bulkDeleteJobs: failed [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        JOBS_MESSAGES.ERROR.BULK_DELETE_FAILED,
      );
    }
  }

  async generateContract(
    id: string,
    businessId: string,
  ): Promise<
    | ContractGenerateResult
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const [job, business] = await Promise.all([
        this.jobsRepository.findById(id, bId, true),
        this.businessRepository.findById(businessId),
      ]);

      if (!job) {
        return new NotFoundException(JOBS_MESSAGES.ERROR.NOT_FOUND);
      }
      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const client = await this.resolveClientPreview(job, bId);
      if (!client) {
        return new BadRequestException(JOBS_MESSAGES.ERROR.CLIENT_NOT_FOUND);
      }

      const title = `${job.title} Service Contract`;
      const html = await this.generateContractHtml(job, client, business);

      let pdfUrl: string | null = null;
      let cloudinaryPublicId: string | undefined;

      try {
        const pdfBuffer = await this.pdfService.renderHtmlToPdf(html);
        const uploaded = await this.uploadContractPdf(pdfBuffer, title);
        pdfUrl = uploaded.secureUrl;
        cloudinaryPublicId = uploaded.publicId;
      } catch (pdfError) {
        this.logger.warn(
          `generateContract: PDF generation failed, returning temporary contract [jobId=${id}]: ${pdfError instanceof Error ? pdfError.message : String(pdfError)}`,
        );
      }

      const contract = await this.contractsRepository.upsertByJobId(
        job._id,
        bId,
        {
          businessId: bId,
          jobId: job._id,
          clientId: client._id,
          title,
          html,
          pdfUrl: pdfUrl ?? '',
          ...(cloudinaryPublicId && { cloudinaryPublicId }),
          status: ContractStatus.DRAFT,
          timezone: job.timezone,
        },
      );

      return {
        contractId: contract._id.toString(),
        pdfUrl,
        html: pdfUrl ? null : html,
      };
    } catch (error) {
      this.logger.error(
        `generateContract: failed [jobId=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        JOBS_MESSAGES.ERROR.CONTRACT_GEN_FAILED,
      );
    }
  }

  async sendContract(
    id: string,
    businessId: string,
  ): Promise<
    | { contractId: string; queued: true }
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const job = await this.jobsRepository.findById(id, bId);
      if (!job) {
        return new NotFoundException(JOBS_MESSAGES.ERROR.NOT_FOUND);
      }

      const contract = await this.contractsRepository.findByJobId(job._id, bId);
      if (!contract) {
        return new NotFoundException(JOBS_MESSAGES.ERROR.CONTRACT_NOT_FOUND);
      }

      await this.agendaService.now<ContractSendJobData>(
        JOBS.JOB_CONTRACT_SEND,
        {
          businessId,
          jobId: id,
          contractId: contract._id.toString(),
        },
      );

      return { contractId: contract._id.toString(), queued: true };
    } catch (error) {
      this.logger.error(
        `sendContract: failed [jobId=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        JOBS_MESSAGES.ERROR.CONTRACT_SEND_FAILED,
      );
    }
  }

  private async handleAcceptedRequestJobCreation(
    payload: AcceptedRequestJobCreationData,
  ): Promise<void> {
    try {
      if (!this.isValidAcceptedRequestPayload(payload)) {
        this.logger.warn(
          `handleAcceptedRequestJobCreation: invalid payload ${JSON.stringify(payload)}`,
        );
        return;
      }

      const businessId = new Types.ObjectId(payload.businessId);
      const sourceRequestId = new Types.ObjectId(payload.sourceRequestId);

      /*
       * This idempotency check avoids duplicate jobs when queue retries happen.
       * Example: network glitch triggers the same payload twice -> still one job.
       */
      const existing = await this.jobsRepository.findBySourceRequestId(
        businessId,
        sourceRequestId,
      );
      if (existing) return;

      const client = await this.clientsRepository.findById(
        payload.clientId,
        businessId,
      );
      if (!client) {
        this.logger.warn(
          `handleAcceptedRequestJobCreation: client not found [clientId=${payload.clientId}]`,
        );
        return;
      }

      await this.jobsRepository.create({
        businessId,
        sourceRequestId,
        clientId: client._id,
        title: payload.title,
        description: payload.description,
        scheduledDate: new Date(payload.scheduledDate),
        price: payload.price,
        notes: payload.notes,
        status: JobStatus.PENDING,
        timezone: payload.timezone,
      });

      void this.invalidateJobsListCache(payload.businessId);
    } catch (error) {
      const duplicateKeyError =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === 11000;
      if (duplicateKeyError) return;

      this.logger.error(
        `handleAcceptedRequestJobCreation: failed ${error instanceof Error ? error.stack : String(error)}`,
      );
    }
  }

  private async handleContractSendJob(
    payload: ContractSendJobData,
  ): Promise<void> {
    try {
      if (!this.isValidContractSendPayload(payload)) {
        this.logger.warn(
          `handleContractSendJob: invalid payload ${JSON.stringify(payload)}`,
        );
        return;
      }

      const businessId = new Types.ObjectId(payload.businessId);
      const [job, business, contract] = await Promise.all([
        this.jobsRepository.findById(payload.jobId, businessId, true),
        this.businessRepository.findById(payload.businessId),
        this.contractsRepository.findById(payload.contractId, businessId),
      ]);

      if (!job || !business || business.deletedAt || !contract) {
        this.logger.warn(
          `handleContractSendJob: missing resources [jobId=${payload.jobId}, contractId=${payload.contractId}]`,
        );
        return;
      }

      const client = await this.resolveClientPreview(job, businessId);
      if (!client) {
        this.logger.warn(
          `handleContractSendJob: client not found [jobId=${payload.jobId}]`,
        );
        return;
      }

      const signingUrl = this.buildContractSigningUrl(
        contract._id.toString(),
        job._id.toString(),
      );

      // The stored PDF may be missing if the initial render failed, or stale
      // if the business edited the HTML afterward (which clears pdfUrl) —
      // re-render from the current HTML so the client always gets the latest.
      if (!contract.pdfUrl) {
        try {
          const pdfBuffer = await this.pdfService.renderHtmlToPdf(
            contract.html,
          );
          const uploaded = await this.uploadContractPdf(
            pdfBuffer,
            contract.title,
          );
          contract.pdfUrl = uploaded.secureUrl;
          contract.cloudinaryPublicId = uploaded.publicId;
          await this.contractsRepository.updateById(
            contract._id.toString(),
            businessId,
            {
              pdfUrl: uploaded.secureUrl,
              cloudinaryPublicId: uploaded.publicId,
            },
          );
        } catch (pdfError) {
          this.logger.error(
            `handleContractSendJob: PDF regeneration failed [contractId=${contract._id.toString()}] ${pdfError instanceof Error ? pdfError.message : String(pdfError)}`,
          );
        }
      }

      const attachments = await this.buildContractAttachment(contract);

      await this.emailService.send({
        to: client.email,
        name: client.name,
        subject: `Contract for ${job.title} — ${business.name}`,
        html: contractClientTemplate(
          client.name,
          business.name,
          job.title,
          contract.pdfUrl,
          signingUrl,
        ),
        attachments,
      });

      const now = new Date();
      await Promise.all([
        this.contractsRepository.updateById(
          contract._id.toString(),
          businessId,
          {
            status: ContractStatus.SENT,
            sentAt: now,
            signingUrl,
            clientAppDeliveredAt: now,
          },
        ),
        this.redisService.set(
          clientAppContractKey(client._id.toString(), contract._id.toString()),
          JSON.stringify({
            contractId: contract._id.toString(),
            jobId: job._id.toString(),
            pdfUrl: contract.pdfUrl,
            signingUrl,
            sentAt: now.toISOString(),
          }),
          CLIENT_APP_CONTRACT_TTL_SECONDS,
        ),
      ]);
    } catch (error) {
      this.logger.error(
        `handleContractSendJob: failed ${error instanceof Error ? error.stack : String(error)}`,
      );
      throw error;
    }
  }

  private async resolveClientPreview(
    job: Job,
    businessId: Types.ObjectId,
  ): Promise<JobClientPreview | null> {
    const maybeClient = job.clientId as unknown;

    if (
      typeof maybeClient === 'object' &&
      maybeClient !== null &&
      '_id' in maybeClient &&
      'name' in maybeClient &&
      'email' in maybeClient
    ) {
      const populated = maybeClient as {
        _id: Types.ObjectId;
        name: string;
        email: string;
      };
      return {
        _id: populated._id,
        name: populated.name,
        email: populated.email,
      };
    }

    const client = await this.clientsRepository.findById(
      job.clientId.toString(),
      businessId,
    );
    if (!client) return null;

    return {
      _id: client._id,
      name: client.name,
      email: client.email,
    };
  }

  private async generateContractHtml(
    job: Job,
    client: JobClientPreview,
    business: Business,
  ): Promise<string> {
    try {
      const priceLine =
        typeof job.price === 'number'
          ? `Total price: ${toTwoDecimal(job.price)}; Deposit (50%) due before work begins: ${toTwoDecimal(job.price / 2)}; Balance (50%) due upon completion: ${toTwoDecimal(job.price / 2)}`
          : 'Total price: To be agreed; payment split 50% deposit before work begins, 50% balance upon completion';

      const systemPrompt = `You are a professional legal document generator for service businesses. Generate a complete, well-formatted HTML service contract.

Requirements:
- Return ONLY valid HTML starting with <!doctype html> — no markdown fences, no explanations
- Use inline CSS; body font-family Arial sans-serif, padding 24px, color #111827
- Include, in this order: contract title; a "Parties" section listing the Service Provider (business name and any provided contact details) and the Client (name and email) as the two contracting parties; service details (title, description, scheduled date, location, notes); a "Payment Terms" section stating a 50% deposit is due before work begins and the remaining 50% balance is due upon completion; a "Client Satisfaction" clause stating that if the client is not satisfied with the completed work, the client has full right to withhold and retain the remaining balance payment, and the business forfeits any claim to that balance; standard service agreement clauses (scope, confidentiality, limitation of liability, governing law); and a signature block
- Signature block: two-column grid — "Client Signature" and "Business Representative Signature", each with a horizontal line above the label and a "Date: ______" line beneath it; note that the client signs electronically when the contract is delivered to them
- Professional, legally appropriate language; no placeholder content`;

      const userContent = [
        `Business (Service Provider): ${business.name}`,
        business.email ? `Business Email: ${business.email}` : null,
        business.phone ? `Business Phone: ${business.phone}` : null,
        business.address ? `Business Address: ${business.address}` : null,
        `Client: ${client.name} (${client.email})`,
        `Service: ${job.title}`,
        job.description ? `Description: ${job.description}` : null,
        `Scheduled Date: ${job.scheduledDate.toISOString()}`,
        job.location ? `Location: ${job.location}` : null,
        priceLine,
        job.notes ? `Notes: ${job.notes}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const message = await this.anthropic.messages.create({
        model: this.contractModel,
        max_tokens: 4096,
        system: [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Generate a service contract:\n${userContent}`,
          },
        ],
      });

      const block = message.content[0];
      if (block.type !== 'text') {
        return this.buildContractHtml(job, client, business);
      }

      const html = block.text
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      if (!html.toLowerCase().includes('<html')) {
        return this.buildContractHtml(job, client, business);
      }

      return html;
    } catch (error) {
      this.logger.warn(
        `generateContractHtml: AI generation failed, using fallback [jobId=${job._id.toString()}]: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.buildContractHtml(job, client, business);
    }
  }

  private buildContractHtml(
    job: Job,
    client: JobClientPreview,
    business: Business,
  ): string {
    const hasPrice = typeof job.price === 'number';
    const deposit = hasPrice ? toTwoDecimal(job.price! / 2) : null;
    const balance = deposit;
    const paymentLines = hasPrice
      ? `
      <p><strong>Total Price:</strong> ${toTwoDecimal(job.price!)}</p>
      <p><strong>Deposit (50%), due before work begins:</strong> ${deposit}</p>
      <p><strong>Balance (50%), due upon completion:</strong> ${balance}</p>`
      : `
      <p><strong>Total Price:</strong> To be agreed</p>
      <p>Payment is split 50% deposit due before work begins and 50% balance due upon completion.</p>`;

    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${job.title} Contract</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
      h1 { margin-bottom: 8px; }
      h2 { margin-top: 28px; margin-bottom: 8px; font-size: 16px; }
      .muted { color: #4b5563; }
      .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; }
      .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .sign { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      .line { border-top: 1px solid #111827; margin-top: 28px; padding-top: 8px; }
      .date-line { border-top: 1px solid #111827; margin-top: 20px; padding-top: 6px; }
    </style>
  </head>
  <body>
    <h1>Service Contract</h1>
    <p class="muted">Between the Service Provider and the Client named below</p>

    <h2>Parties</h2>
    <div class="parties">
      <div class="card">
        <p><strong>Service Provider</strong></p>
        <p>${business.name}</p>
        ${business.email ? `<p>${business.email}</p>` : ''}
        ${business.phone ? `<p>${business.phone}</p>` : ''}
        ${business.address ? `<p>${business.address}</p>` : ''}
      </div>
      <div class="card">
        <p><strong>Client</strong></p>
        <p>${client.name}</p>
        <p>${client.email}</p>
      </div>
    </div>

    <h2>Service Details</h2>
    <div class="card">
      <p><strong>Service:</strong> ${job.title}</p>
      ${job.description ? `<p><strong>Description:</strong> ${job.description}</p>` : ''}
      <p><strong>Scheduled Date:</strong> ${job.scheduledDate.toISOString()}</p>
      ${job.location ? `<p><strong>Location:</strong> ${job.location}</p>` : ''}
      ${job.notes ? `<p><strong>Notes:</strong> ${job.notes}</p>` : ''}
    </div>

    <h2>Payment Terms</h2>
    <div class="card">
      ${paymentLines}
    </div>

    <h2>Client Satisfaction</h2>
    <p>
      If the Client is not satisfied with the completed work, the Client has full right to
      withhold and retain the remaining balance payment described above, and the Service
      Provider forfeits any claim to that balance.
    </p>

    <p>
      This agreement confirms that ${business.name} will perform the service listed above
      according to the terms and timelines described in this contract.
    </p>

    <h2>Signatures</h2>
    <p class="muted">The Client signs electronically when this contract is delivered to them.</p>
    <div class="sign">
      <div>
        <div class="line">Client Signature</div>
        <div class="date-line">Date</div>
      </div>
      <div>
        <div class="line">Business Representative Signature</div>
        <div class="date-line">Date</div>
      </div>
    </div>
  </body>
</html>`;
  }

  private async uploadContractPdf(
    pdfBuffer: Buffer,
    title: string,
  ): Promise<ContractUploadResult> {
    const { url, publicId } = await this.storageService.uploadBuffer(
      pdfBuffer,
      STORAGE_FOLDERS.contracts,
      `${title}.pdf`,
    );
    return { secureUrl: url, publicId };
  }

  private async buildContractAttachment(contract: Contract): Promise<
    | Array<{
        ContentType: string;
        Filename: string;
        Base64Content: string;
      }>
    | undefined
  > {
    try {
      const response = await fetch(contract.pdfUrl);
      if (!response.ok) return undefined;

      const bytes = await response.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');

      return [
        {
          ContentType: 'application/pdf',
          Filename: `${contract.title}.pdf`,
          Base64Content: base64,
        },
      ];
    } catch (error) {
      this.logger.warn(
        `buildContractAttachment: failed to fetch pdf [contractId=${contract._id.toString()}] ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private buildContractSigningUrl(contractId: string, jobId: string): string {
    const base = this.clientAppUrl.replace(/\/$/, '');
    return `${base}/contracts/sign/${contractId}?jobId=${jobId}`;
  }

  /**
   * Converts UTC "now" to a Date whose UTC components match business-local time.
   *
   * Example:
   * - utcDate: 2026-05-08T15:00:00.000Z
   * - timezone: "America/New_York" (UTC-4)
   * - stored Date becomes 2026-05-08T11:00:00.000Z
   *
   * This keeps operational timestamps aligned with each business's local clock.
   */
  private resolveJobsPagination(
    page?: number,
    limit?: number,
  ): { page: number; limit: number; skip: number } {
    const resolvedPage = page ?? 1;
    const resolvedLimit = Math.min(
      Math.max(limit ?? JOBS_LIST_DEFAULT_LIMIT, 1),
      JOBS_LIST_MAX_LIMIT,
    );

    return {
      page: resolvedPage,
      limit: resolvedLimit,
      skip: (resolvedPage - 1) * resolvedLimit,
    };
  }

  private async buildJobsListCacheKey(
    businessId: string,
    params: {
      page: number;
      limit: number;
      search?: string;
      clientId?: string;
      status?: JobStatus;
    },
  ): Promise<string> {
    try {
      const versionKey = jobsListVersionKey(businessId);
      const currentVersionRaw = await this.redisService.get(versionKey);
      const currentVersion = parseInt(currentVersionRaw ?? '1', 10) || 1;

      const paramsHash = createHash('sha1')
        .update(
          JSON.stringify({
            version: currentVersion,
            ...params,
          }),
        )
        .digest('hex');

      return jobsListCacheKey(businessId, paramsHash);
    } catch (error) {
      this.logger.warn(
        `buildJobsListCacheKey: cache unavailable [businessId=${businessId}] ${error instanceof Error ? error.message : String(error)}`,
      );

      const fallbackHash = createHash('sha1')
        .update(JSON.stringify(params))
        .digest('hex');

      return jobsListCacheKey(businessId, fallbackHash);
    }
  }

  private async getCachedJobsList(
    cacheKey: string,
  ): Promise<PaginatedJobs | null> {
    try {
      const cached = await this.redisService.get(cacheKey);
      if (!cached) return null;
      return JSON.parse(cached) as PaginatedJobs;
    } catch (error) {
      this.logger.warn(
        `getCachedJobsList: cache read failed [key=${cacheKey}] ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async setCachedJobsList(
    cacheKey: string,
    payload: PaginatedJobs,
  ): Promise<void> {
    try {
      await this.redisService.set(
        cacheKey,
        JSON.stringify(payload),
        CACHE_TTL.JOBS_LIST,
      );
    } catch (error) {
      this.logger.warn(
        `setCachedJobsList: cache write failed [key=${cacheKey}] ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async getCachedJobDetail(cacheKey: string): Promise<Job | null> {
    try {
      const cached = await this.redisService.get(cacheKey);
      if (!cached) return null;
      return JSON.parse(cached) as Job;
    } catch (error) {
      this.logger.warn(
        `getCachedJobDetail: cache read failed [key=${cacheKey}] ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async setCachedJobDetail(cacheKey: string, job: Job): Promise<void> {
    try {
      await this.redisService.set(
        cacheKey,
        JSON.stringify(job),
        CACHE_TTL.JOB_DETAIL,
      );
    } catch (error) {
      this.logger.warn(
        `setCachedJobDetail: cache write failed [key=${cacheKey}] ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async invalidateJobsListCache(businessId: string): Promise<void> {
    try {
      const versionKey = jobsListVersionKey(businessId);
      await this.redisService.incr(versionKey);
      await this.redisService.expire(versionKey, CACHE_TTL.JOBS_LIST_VERSION);
    } catch (error) {
      this.logger.warn(
        `invalidateJobsListCache: failed [businessId=${businessId}] ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private isValidAcceptedRequestPayload(
    payload: AcceptedRequestJobCreationData,
  ): boolean {
    return (
      !!payload &&
      Types.ObjectId.isValid(payload.businessId) &&
      Types.ObjectId.isValid(payload.sourceRequestId) &&
      Types.ObjectId.isValid(payload.clientId) &&
      typeof payload.title === 'string' &&
      payload.title.trim().length > 0 &&
      typeof payload.scheduledDate === 'string' &&
      !Number.isNaN(new Date(payload.scheduledDate).getTime()) &&
      typeof payload.timezone === 'string' &&
      payload.timezone.trim().length > 0
    );
  }

  private isValidContractSendPayload(payload: ContractSendJobData): boolean {
    return (
      !!payload &&
      Types.ObjectId.isValid(payload.businessId) &&
      Types.ObjectId.isValid(payload.jobId) &&
      Types.ObjectId.isValid(payload.contractId)
    );
  }
}
