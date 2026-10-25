import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { PdfService } from 'src/modules/pdf/pdf.service';
import { StorageService } from 'src/modules/storage/storage.service';
import { STORAGE_FOLDERS } from 'src/modules/storage/constants/storage-folders.constants';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { CONTRACTS_MESSAGES } from 'src/common/constants/messages/contracts.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { toBusinessLocalTime } from 'src/common/utils/timezone.util';
import { JobsRepository } from 'src/modules/jobs/repositories/jobs.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { EmailService } from '../../email/services/email.service';
import { CreateContractDto } from '../dto/create-contract.dto';
import { ListContractsDto } from '../dto/list-contracts.dto';
import { SendContractDto } from '../dto/send-contract.dto';
import { UpdateContractDto } from '../dto/update-contract.dto';
import { Contract, ContractStatus } from '../schemas/contract.schema';
import { ContractsRepository } from '../repositories/contracts.repository';

interface PaginatedContracts {
  data: Contract[];
  meta: ReturnType<typeof buildMeta>;
}

const contractsListCacheKey = (
  businessId: string,
  paramsHash: string,
): string => `${businessId}:contracts:list:${paramsHash}`;

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly contractsRepository: ContractsRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly emailService: EmailService,
    private readonly redisService: RedisService,
    private readonly storageService: StorageService,
    private readonly pdfService: PdfService,
  ) {}

  async listContracts(
    businessId: string,
    dto: ListContractsDto,
  ): Promise<PaginatedContracts | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit ?? 10);
      const paramsHash = createHash('sha1')
        .update(
          JSON.stringify({
            clientId: dto.clientId ?? '',
            status: dto.status ?? '',
            page: pagination.page,
            limit: pagination.limit,
          }),
        )
        .digest('hex');

      const cacheKey = contractsListCacheKey(businessId, paramsHash);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as PaginatedContracts;
      }

      const { data, total } = await this.contractsRepository.findAll(
        new Types.ObjectId(businessId),
        {
          clientId: dto.clientId,
          status: dto.status,
        },
        pagination,
      );

      const result: PaginatedContracts = {
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.CONTRACTS_LIST)
        .catch(() => undefined);

      return result;
    } catch (error) {
      this.logger.error(
        `listContracts: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getContract(
    id: string,
    businessId: string,
  ): Promise<Contract | NotFoundException | InternalServerErrorException> {
    try {
      const contract = await this.contractsRepository.findById(
        id,
        new Types.ObjectId(businessId),
      );
      if (!contract) {
        return new NotFoundException(CONTRACTS_MESSAGES.ERROR.NOT_FOUND);
      }

      return contract;
    } catch (error) {
      this.logger.error(
        `getContract: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Creates a contract bound to a specific job+client pair.
   *
   * Example:
   * POST /contracts
   * {
   *   "clientId": "...",
   *   "jobId": "...",
   *   "name": "Drain Cleaning Agreement",
   *   "amount": 350,
   *   "expiresAt": "2026-06-01"
   * }
   */
  async createContract(
    businessId: string,
    dto: CreateContractDto,
  ): Promise<
    | Contract
    | NotFoundException
    | BadRequestException
    | ConflictException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const [client, job, existing] = await Promise.all([
        this.clientsRepository.findById(dto.clientId, bId),
        this.jobsRepository.findById(dto.jobId, bId),
        this.contractsRepository.findByJobId(
          new Types.ObjectId(dto.jobId),
          bId,
        ),
      ]);

      if (!client) {
        return new NotFoundException(CONTRACTS_MESSAGES.ERROR.CLIENT_NOT_FOUND);
      }

      if (!job) {
        return new NotFoundException(CONTRACTS_MESSAGES.ERROR.JOB_NOT_FOUND);
      }

      if (existing) {
        return new ConflictException(
          CONTRACTS_MESSAGES.ERROR.DUPLICATE_FOR_JOB,
        );
      }

      const html = this.buildContractHtml(dto.name, job.title, client.name);

      const created = await this.contractsRepository.create({
        businessId: bId,
        clientId: client._id,
        jobId: job._id,
        title: dto.name,
        amount: dto.amount,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        html,
        pdfUrl: '',
        status: ContractStatus.DRAFT,
        timezone: job.timezone ?? 'UTC',
      });

      await this.invalidateContractsListCache(businessId);
      return created;
    } catch (error) {
      this.logger.error(
        `createContract: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async updateContract(
    id: string,
    businessId: string,
    dto: UpdateContractDto,
  ): Promise<
    | Contract
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.contractsRepository.findById(id, bId);
      if (!existing) {
        return new NotFoundException(CONTRACTS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (
        dto.status === ContractStatus.SIGNED &&
        !dto.signedAt &&
        !existing.signedAt
      ) {
        return new BadRequestException(
          CONTRACTS_MESSAGES.ERROR.INVALID_SIGNED_AT,
        );
      }

      const now = toBusinessLocalTime(new Date(), existing.timezone ?? 'UTC');
      const htmlChanged = dto.html !== undefined && dto.html !== existing.html;
      const update: Partial<Contract> = {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.signedAt !== undefined && { signedAt: new Date(dto.signedAt) }),
        ...(dto.html !== undefined && { html: dto.html }),
        // Edited content invalidates the PDF rendered from the old HTML,
        // forcing a fresh render before the next preview or send.
        ...(htmlChanged && { pdfUrl: '', cloudinaryPublicId: '' }),
      };

      if (dto.status === ContractStatus.SENT && !existing.sentAt) {
        update.sentAt = now;
      }

      if (dto.status === ContractStatus.SIGNED && !dto.signedAt) {
        update.signedAt = now;
      }

      const updated = await this.contractsRepository.updateById(
        id,
        bId,
        update,
      );
      if (!updated) {
        return new NotFoundException(CONTRACTS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (htmlChanged && existing.cloudinaryPublicId) {
        void this.destroyContractAsset(existing.cloudinaryPublicId);
      }

      await this.invalidateContractsListCache(businessId);
      return updated;
    } catch (error) {
      this.logger.error(
        `updateContract: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async deleteContract(
    id: string,
    businessId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const deleted = await this.contractsRepository.softDelete(
        id,
        new Types.ObjectId(businessId),
      );

      if (!deleted) {
        return new NotFoundException(CONTRACTS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (deleted.cloudinaryPublicId) {
        void this.destroyContractAsset(deleted.cloudinaryPublicId);
      }

      await this.invalidateContractsListCache(businessId);
      return null;
    } catch (error) {
      this.logger.error(
        `deleteContract: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getContractPdf(
    id: string,
    businessId: string,
  ): Promise<
    { url: string } | NotFoundException | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const contract = await this.contractsRepository.findById(id, bId);
      if (!contract) {
        return new NotFoundException(CONTRACTS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (contract.pdfUrl) {
        return { url: contract.pdfUrl };
      }

      const html = contract.html ?? this.buildContractPdfFallbackHtml(contract);
      const pdfBuffer = await this.pdfService.renderHtmlToPdf(html);
      const uploaded = await this.uploadContractPdf(pdfBuffer, contract.title);

      await this.contractsRepository.updateById(id, bId, {
        pdfUrl: uploaded.secureUrl,
        cloudinaryPublicId: uploaded.publicId,
      });

      return { url: uploaded.secureUrl };
    } catch (error) {
      this.logger.error(
        `getContractPdf: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        CONTRACTS_MESSAGES.ERROR.PDF_FAILED,
      );
    }
  }

  async sendContract(
    id: string,
    businessId: string,
    dto: SendContractDto,
  ): Promise<
    { queued: boolean } | NotFoundException | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const contract = await this.contractsRepository.findById(id, bId);
      if (!contract) {
        return new NotFoundException(CONTRACTS_MESSAGES.ERROR.NOT_FOUND);
      }

      const pdf = await this.getContractPdf(id, businessId);
      if (
        pdf instanceof NotFoundException ||
        pdf instanceof InternalServerErrorException
      ) {
        return pdf;
      }

      const sentAt = toBusinessLocalTime(
        new Date(),
        contract.timezone ?? 'UTC',
      );
      await this.contractsRepository.updateById(id, bId, {
        status: ContractStatus.SENT,
        sentAt,
      });

      // Non-blocking email delivery keeps endpoint latency stable.
      void this.emailService
        .send({
          to: dto.clientEmail,
          name: dto.clientEmail,
          subject: `Contract: ${contract.title}`,
          html: `<p>Your contract is ready.</p><p><a href="${pdf.url}">Download contract PDF</a></p>`,
        })
        .catch((error: unknown) =>
          this.logger.error(
            `sendContract: email send failed [id=${id}] ${error instanceof Error ? error.message : String(error)}`,
          ),
        );

      await this.invalidateContractsListCache(businessId);
      return { queued: true };
    } catch (error) {
      this.logger.error(
        `sendContract: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        CONTRACTS_MESSAGES.ERROR.SEND_FAILED,
      );
    }
  }

  private buildContractHtml(
    contractName: string,
    serviceTitle: string,
    clientName: string,
  ): string {
    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${contractName}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
      .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
      .muted { color: #4b5563; }
    </style>
  </head>
  <body>
    <h1>${contractName}</h1>
    <p class="muted">Service contract document</p>
    <div class="card">
      <p><strong>Client:</strong> ${clientName}</p>
      <p><strong>Service:</strong> ${serviceTitle}</p>
    </div>
  </body>
</html>`;
  }

  private buildContractPdfFallbackHtml(contract: Contract): string {
    return this.buildContractHtml(contract.title, contract.title, 'Client');
  }

  private async uploadContractPdf(
    pdfBuffer: Buffer,
    title: string,
  ): Promise<{ secureUrl: string; publicId: string }> {
    const { url, publicId } = await this.storageService.uploadBuffer(
      pdfBuffer,
      STORAGE_FOLDERS.contracts,
      `${title}.pdf`,
    );
    return { secureUrl: url, publicId };
  }

  private async destroyContractAsset(publicId: string): Promise<void> {
    await this.storageService.delete(publicId).catch(() => undefined);
  }

  private async invalidateContractsListCache(
    businessId: string,
  ): Promise<void> {
    await this.redisService
      .delByPattern(`${businessId}:contracts:list:*`)
      .catch(() => 0);
  }
}
