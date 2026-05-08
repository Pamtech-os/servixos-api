import {
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
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { InvoicesRepository } from '../../invoices/repositories/invoices.repository';
import { Invoice, InvoiceStatus } from '../../invoices/schemas/invoice.schema';
import { RedisService } from '../../redis/services/redis.service';
import {
  ClientInvoiceDetail,
  ClientInvoiceListItem,
} from '../types/client-portal.types';
import {
  ClientInvoiceSortBy,
  ClientInvoiceStatus,
  ListClientInvoicesDto,
  SortOrder,
} from '../dto/list-client-invoices.dto';

interface PaginatedClientInvoices {
  data: ClientInvoiceListItem[];
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
export class ClientInvoicesService {
  private readonly logger = new Logger(ClientInvoicesService.name);
  private readonly currency: string;

  constructor(
    config: ConfigService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly redisService: RedisService,
  ) {
    this.currency = config.get<string>('DEFAULT_CURRENCY') ?? 'USD';
  }

  async listInvoices(
    businessId: string,
    clientId: string,
    dto: ListClientInvoicesDto,
  ): Promise<PaginatedClientInvoices | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit ?? 10);
      const queryHash = JSON.stringify({
        page: pagination.page,
        limit: pagination.limit,
        status: dto.status,
        from: dto.from,
        to: dto.to,
        sort: dto.sort,
        order: dto.order,
      });

      const cacheKey = CLIENT_CACHE_KEYS.invoices(clientId, queryHash);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as PaginatedClientInvoices;
      }

      const mappedStatus = this.mapInvoiceStatus(dto.status);
      const sort = this.mapSort(dto.sort, dto.order);

      const { data, total } = await this.invoicesRepository.findAllForClient(
        new Types.ObjectId(businessId),
        new Types.ObjectId(clientId),
        {
          status: mappedStatus,
          from: dto.from ? new Date(dto.from) : undefined,
          to: dto.to ? new Date(dto.to) : undefined,
        },
        pagination,
        sort,
      );

      const meta = buildMeta(pagination.page, pagination.limit, total);
      const result: PaginatedClientInvoices = {
        data: data.map((invoice) => this.mapInvoiceListItem(invoice)),
        meta: {
          ...meta,
          hasNextPage: meta.page < meta.totalPages,
          hasPreviousPage: meta.page > 1,
        },
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CLIENT_CACHE_TTLS.INVOICES_LIST)
        .catch(() => undefined);

      return result;
    } catch (error) {
      this.logger.error(
        `listInvoices: failed [businessId=${businessId}, clientId=${clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getInvoice(
    businessId: string,
    clientId: string,
    id: string,
  ): Promise<
    ClientInvoiceDetail | NotFoundException | InternalServerErrorException
  > {
    try {
      const cacheKey = CLIENT_CACHE_KEYS.invoice(clientId, id);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ClientInvoiceDetail;
      }

      const [invoice, business] = await Promise.all([
        this.invoicesRepository.findByIdForClient(
          id,
          new Types.ObjectId(businessId),
          new Types.ObjectId(clientId),
        ),
        this.businessRepository.findById(businessId),
      ]);

      if (!invoice) {
        return new NotFoundException(CLIENT_MESSAGES.INVOICE.ERROR.NOT_FOUND);
      }

      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const detail: ClientInvoiceDetail = {
        ...this.mapInvoiceListItem(invoice),
        notes: 'Net payment terms apply',
        lineItems: (invoice.lineItems ?? []).map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: this.toMinorUnits(line.unitPrice),
          total: this.toMinorUnits(line.quantity * line.unitPrice),
        })),
        serviceProvider: {
          businessName: business.name,
          supportEmail: business.email,
        },
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(detail), CLIENT_CACHE_TTLS.INVOICE_SINGLE)
        .catch(() => undefined);

      return detail;
    } catch (error) {
      this.logger.error(
        `getInvoice: failed [businessId=${businessId}, clientId=${clientId}, id=${id}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private mapInvoiceStatus(
    status: ClientInvoiceStatus | undefined,
  ): InvoiceStatus | undefined {
    if (!status) return undefined;

    if (status === ClientInvoiceStatus.UNPAID) {
      return InvoiceStatus.PENDING;
    }

    if (status === ClientInvoiceStatus.PARTIAL) {
      return InvoiceStatus.PARTIAL;
    }

    return InvoiceStatus.PAID;
  }

  private mapSort(
    field: ClientInvoiceSortBy | undefined,
    order: SortOrder | undefined,
  ): { field: 'dueDate' | 'totalAmount' | 'invoiceDate'; direction: 1 | -1 } {
    const direction: 1 | -1 = order === SortOrder.ASC ? 1 : -1;

    switch (field) {
      case ClientInvoiceSortBy.AMOUNT:
        return { field: 'totalAmount', direction };
      case ClientInvoiceSortBy.ISSUED_DATE:
        return { field: 'invoiceDate', direction };
      default:
        return { field: 'dueDate', direction };
    }
  }

  private mapInvoiceListItem(invoice: Invoice): ClientInvoiceListItem {
    return {
      id: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      issuedDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate?.toISOString(),
      amount: this.toMinorUnits(invoice.totalAmount),
      status: this.toClientStatus(invoice.status),
      currency: this.currency,
    };
  }

  private toClientStatus(status: InvoiceStatus): 'paid' | 'partial' | 'unpaid' {
    if (status === InvoiceStatus.PAID) return 'paid';
    if (status === InvoiceStatus.PARTIAL) return 'partial';
    return 'unpaid';
  }

  private toMinorUnits(amount: number): number {
    return Math.round((amount ?? 0) * 100);
  }
}
