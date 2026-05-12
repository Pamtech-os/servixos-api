import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CLIENT_CACHE_KEYS } from 'src/client/constants/cache-keys';
import { CLIENT_CACHE_TTLS } from 'src/client/constants/cache-ttls';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { InvoicesRepository } from '../../invoices/repositories/invoices.repository';
import { ContractsRepository } from '../../contracts/repositories/contracts.repository';
import { MessagingService } from '../../messaging/services/messaging.service';
import { Message } from '../../messaging/schemas/message.schema';
import { ClientFileListItem } from '../types/client-portal.types';
import {
  ClientFileFormat,
  ClientFileSortBy,
  ListClientFilesDto,
} from '../dto/list-client-files.dto';
import { SortOrder } from '../dto/list-client-invoices.dto';
import { RedisService } from '../../redis/services/redis.service';

interface PaginatedClientFiles {
  data: ClientFileListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class ClientFilesService {
  private readonly logger = new Logger(ClientFilesService.name);

  constructor(
    private readonly invoicesRepository: InvoicesRepository,
    private readonly contractsRepository: ContractsRepository,
    private readonly messagingService: MessagingService,
    private readonly redisService: RedisService,
  ) {}

  async listFiles(
    businessId: string,
    clientId: string,
    dto: ListClientFilesDto,
  ): Promise<PaginatedClientFiles | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit ?? 10);
      const queryHash = JSON.stringify({
        ...dto,
        page: pagination.page,
        limit: pagination.limit,
      });

      const cacheKey = CLIENT_CACHE_KEYS.files(clientId, queryHash);
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as PaginatedClientFiles;

      const [invoiceFiles, contractFiles, attachmentRows] = await Promise.all([
        this.invoicesRepository.findPdfFilesForClient(
          new Types.ObjectId(businessId),
          new Types.ObjectId(clientId),
          300,
        ),
        this.contractsRepository.findPdfFilesForClient(
          new Types.ObjectId(businessId),
          new Types.ObjectId(clientId),
          300,
        ),
        this.messagingService.listAttachmentsForClient(businessId, clientId, {
          formatPattern: null,
          pagination: { page: 1, limit: 300, skip: 0 },
          sort: { createdAt: -1 },
        }),
      ]);

      const files: ClientFileListItem[] = [
        ...invoiceFiles.map((invoice) => ({
          id: `inv:${invoice._id.toString()}`,
          filename: invoice.invoiceNumber,
          format: 'pdf' as const,
          filesizeBytes: 0,
          generatedDate: invoice.invoiceDate.toISOString(),
        })),
        ...contractFiles.map((contract) => ({
          id: `ctr:${contract._id.toString()}`,
          filename: contract.title,
          format: 'pdf' as const,
          filesizeBytes: 0,
          generatedDate: (
            contract.sentAt ??
            contract.signedAt ??
            new Date()
          ).toISOString(),
        })),
        ...attachmentRows.data
          .map((message) => this.mapAttachmentToFile(message))
          .filter((row): row is ClientFileListItem => !!row),
      ];

      const filtered = dto.format
        ? files.filter((row) => row.format === dto.format)
        : files;

      const sorted = this.sortFiles(filtered, dto.sort, dto.order);
      const paged = sorted.slice(
        pagination.skip,
        pagination.skip + pagination.limit,
      );

      const meta = buildMeta(pagination.page, pagination.limit, sorted.length);
      const result: PaginatedClientFiles = {
        data: paged,
        meta,
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CLIENT_CACHE_TTLS.FILES_LIST)
        .catch(() => undefined);

      return result;
    } catch (error) {
      this.logger.error(
        `listFiles: failed [businessId=${businessId}, clientId=${clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async generateDownload(
    businessId: string,
    clientId: string,
    id: string,
  ): Promise<
    | { downloadUrl: string; expiresInSeconds: number; filename: string }
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const cacheKey = CLIENT_CACHE_KEYS.fileDownload(clientId, id);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as {
          downloadUrl: string;
          expiresInSeconds: number;
          filename: string;
        };
      }

      const [sourceType, sourceId] = id.split(':');
      if (!sourceType || !sourceId) {
        return new NotFoundException(CLIENT_MESSAGES.FILE.ERROR.NOT_FOUND);
      }

      let downloadUrl = '';
      let filename = '';

      if (sourceType === 'inv') {
        const invoice = await this.invoicesRepository.findByIdForClient(
          sourceId,
          new Types.ObjectId(businessId),
          new Types.ObjectId(clientId),
        );

        if (!invoice?.pdfUrl) {
          return new NotFoundException(CLIENT_MESSAGES.FILE.ERROR.NOT_FOUND);
        }

        downloadUrl = invoice.pdfUrl;
        filename = `${invoice.invoiceNumber}.pdf`;
      } else if (sourceType === 'ctr') {
        const contract = await this.contractsRepository.findByIdForClient(
          sourceId,
          new Types.ObjectId(businessId),
          new Types.ObjectId(clientId),
        );

        if (!contract?.pdfUrl) {
          return new NotFoundException(CLIENT_MESSAGES.FILE.ERROR.NOT_FOUND);
        }

        downloadUrl = contract.pdfUrl;
        filename = `${contract.title}.pdf`;
      } else if (sourceType === 'msg') {
        const attachment = await this.messagingService.getAttachmentForClient(
          businessId,
          clientId,
          sourceId,
        );
        if (!attachment?.attachmentUrl) {
          return new NotFoundException(CLIENT_MESSAGES.FILE.ERROR.NOT_FOUND);
        }

        downloadUrl = attachment.attachmentUrl;
        filename = attachment.fileName ?? 'attachment';
      } else {
        return new NotFoundException(CLIENT_MESSAGES.FILE.ERROR.NOT_FOUND);
      }

      const result = {
        downloadUrl,
        expiresInSeconds: 3600,
        filename,
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CLIENT_CACHE_TTLS.FILE_DOWNLOAD)
        .catch(() => undefined);

      return result;
    } catch (error) {
      this.logger.error(
        `generateDownload: failed [businessId=${businessId}, clientId=${clientId}, id=${id}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private mapAttachmentToFile(message: Message): ClientFileListItem | null {
    const format = this.resolveFormat(message.fileName, message.mimeType);
    if (!format) return null;

    return {
      id: `msg:${message._id.toString()}`,
      filename: message.fileName?.replace(/\.[^.]+$/, '') ?? 'Attachment',
      format,
      filesizeBytes: message.fileSize ?? 0,
      generatedDate: (message as Message & { createdAt?: Date }).createdAt
        ? (
            (message as Message & { createdAt?: Date }).createdAt as Date
          ).toISOString()
        : new Date().toISOString(),
    };
  }

  private resolveFormat(
    fileName?: string,
    mimeType?: string,
  ): ClientFileFormat | null {
    const ext = fileName?.split('.').pop()?.toLowerCase();
    const byExt = ext as ClientFileFormat | undefined;

    if (
      byExt &&
      [
        ClientFileFormat.PDF,
        ClientFileFormat.DOC,
        ClientFileFormat.DOCX,
        ClientFileFormat.XLSX,
        ClientFileFormat.PNG,
        ClientFileFormat.JPG,
      ].includes(byExt)
    ) {
      return byExt;
    }

    if (!mimeType) return null;

    if (mimeType.includes('pdf')) return ClientFileFormat.PDF;
    if (mimeType.includes('word')) return ClientFileFormat.DOCX;
    if (mimeType.includes('excel') || mimeType.includes('sheet')) {
      return ClientFileFormat.XLSX;
    }
    if (mimeType.includes('png')) return ClientFileFormat.PNG;
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      return ClientFileFormat.JPG;
    }

    return null;
  }

  private sortFiles(
    rows: ClientFileListItem[],
    sortBy: ClientFileSortBy | undefined,
    order: SortOrder | undefined,
  ): ClientFileListItem[] {
    const sorted = [...rows];
    const dir = order === SortOrder.ASC ? 1 : -1;

    sorted.sort((a, b) => {
      if (sortBy === ClientFileSortBy.FILENAME) {
        return a.filename.localeCompare(b.filename) * dir;
      }

      if (sortBy === ClientFileSortBy.FILESIZE_BYTES) {
        return (a.filesizeBytes - b.filesizeBytes) * dir;
      }

      const dateA = new Date(a.generatedDate).getTime();
      const dateB = new Date(b.generatedDate).getTime();
      return (dateA - dateB) * dir;
    });

    return sorted;
  }
}
