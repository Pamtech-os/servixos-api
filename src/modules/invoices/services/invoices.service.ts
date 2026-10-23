import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Job as AgendaJob } from 'agenda';
import { Types } from 'mongoose';
import { PdfService } from 'src/modules/pdf/pdf.service';
import { StorageService } from 'src/modules/storage/storage.service';
import { STORAGE_FOLDERS } from 'src/modules/storage/constants/storage-folders.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { INVOICES_MESSAGES } from 'src/common/constants/messages/invoices.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { toBusinessLocalTime } from 'src/common/utils/timezone.util';
import { toTwoDecimal } from 'src/common/utils/number.util';
import { escapeHtml, textToHtml } from 'src/common/utils/html.util';
import { formatError, formatErrorMessage } from 'src/common/utils/error.util';
import { calculateInvoiceStatus } from '../utils/invoice-status.util';
import { JOBS } from 'src/common/constants/agenda.constants';
import { AgendaService } from '../../agenda/services/agenda.service';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { EmailService } from '../../email/services/email.service';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { ListInvoicesDto } from '../dto/list-invoices.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';
import {
  InvoiceListStatistics,
  InvoicesRepository,
} from '../repositories/invoices.repository';
import {
  InvoiceAutoCreatePaymentJobData,
  InvoiceSendJobData,
} from '../types/invoices.types';
import {
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
} from '../schemas/invoice.schema';
import { JobsRepository } from '../../jobs/repositories/jobs.repository';
import { RequestsRepository } from '../../requests/repositories/requests.repository';
import { ContractStatus } from '../../contracts/schemas/contract.schema';
import { ContractsRepository } from '../../contracts/repositories/contracts.repository';
import { RedisService } from '../../redis/services/redis.service';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';

// ─── Cache key helpers ────────────────────────────────────────────────────────
const invoicesListVersionKey = (businessId: string): string =>
  `${businessId}:invoices:list:version`;

const invoicesListCacheKey = (
  businessId: string,
  version: string,
  search: string,
  clientId: string,
  status: string,
  page: number,
  limit: number,
): string =>
  `${businessId}:invoices:list:v${version}:s${search}:c${clientId}:st${status}:p${page}:l${limit}`;

const invoiceDetailCacheKey = (businessId: string, id: string): string =>
  `${businessId}:invoices:${id}`;

interface PaginatedInvoices {
  statistics: InvoiceListStatistics;
  data: Invoice[];
  meta: ReturnType<typeof buildMeta>;
}

interface InvoiceClientPreview {
  _id: Types.ObjectId;
  name: string;
  email: string;
}

@Injectable()
export class InvoicesService implements OnModuleInit {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly invoicesRepository: InvoicesRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly requestsRepository: RequestsRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly contractsRepository: ContractsRepository,
    private readonly agendaService: AgendaService,
    private readonly emailService: EmailService,
    private readonly storageService: StorageService,
    private readonly redisService: RedisService,
    private readonly pdfService: PdfService,
  ) {}

  onModuleInit(): void {
    this.agendaService.define(JOBS.INVOICE_SEND, async (job: AgendaJob) => {
      const payload = job.attrs.data as InvoiceSendJobData;
      await this.handleInvoiceSendJob(payload);
    });
  }

  async listInvoices(
    businessId: string,
    dto: ListInvoicesDto,
  ): Promise<PaginatedInvoices | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit ?? 6);
      const version = await this.getListVersion(businessId);
      const cacheKey = invoicesListCacheKey(
        businessId,
        version,
        dto.search ?? '',
        dto.clientId ?? '',
        dto.status ?? '',
        pagination.page,
        pagination.limit,
      );

      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as PaginatedInvoices;

      const { data, total, statistics } = await this.invoicesRepository.findAll(
        new Types.ObjectId(businessId),
        {
          search: dto.search,
          clientId: dto.clientId,
          status: dto.status,
        },
        pagination,
      );

      const result: PaginatedInvoices = {
        statistics,
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.INVOICES_LIST)
        .catch((err: unknown) =>
          this.logger.warn(
            `listInvoices: cache write failed [businessId=${businessId}]: ${formatErrorMessage(err)}`,
          ),
        );

      return result;
    } catch (error) {
      this.logger.error(
        `listInvoices: failed [businessId=${businessId}]: ${formatError(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getInvoice(
    id: string,
    businessId: string,
  ): Promise<Invoice | NotFoundException | InternalServerErrorException> {
    try {
      const cacheKey = invoiceDetailCacheKey(businessId, id);
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as Invoice;

      const invoice = await this.invoicesRepository.findById(
        id,
        new Types.ObjectId(businessId),
        true,
      );
      if (!invoice) {
        return new NotFoundException(INVOICES_MESSAGES.ERROR.NOT_FOUND);
      }

      await this.redisService
        .set(cacheKey, JSON.stringify(invoice), CACHE_TTL.INVOICE_DETAIL)
        .catch((err: unknown) =>
          this.logger.warn(
            `getInvoice: cache write failed [id=${id}]: ${formatErrorMessage(err)}`,
          ),
        );

      return invoice;
    } catch (error) {
      this.logger.error(
        `getInvoice: failed [id=${id}, businessId=${businessId}]: ${formatError(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createInvoice(
    businessId: string,
    dto: CreateInvoiceDto,
  ): Promise<
    | Invoice
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      if (!dto.lineItems?.length) {
        return new BadRequestException(INVOICES_MESSAGES.ERROR.NO_LINE_ITEMS);
      }

      const bId = new Types.ObjectId(businessId);
      const [business, client] = await Promise.all([
        this.businessRepository.findById(businessId),
        this.clientsRepository.findById(dto.clientId, bId),
      ]);

      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }
      if (!client) {
        return new NotFoundException(INVOICES_MESSAGES.ERROR.CLIENT_NOT_FOUND);
      }

      if (dto.jobId) {
        const job = await this.jobsRepository.findById(dto.jobId, bId);
        if (!job) {
          return new BadRequestException(INVOICES_MESSAGES.ERROR.JOB_NOT_FOUND);
        }
        if (job.clientId.toString() !== client._id.toString()) {
          return new BadRequestException(
            INVOICES_MESSAGES.ERROR.JOB_CLIENT_MISMATCH,
          );
        }

        const jobContract = await this.contractsRepository.findByJobId(
          job._id,
          bId,
        );
        if (!jobContract) {
          return new BadRequestException(
            INVOICES_MESSAGES.ERROR.CONTRACT_REQUIRED,
          );
        }
        if (jobContract.status !== ContractStatus.SIGNED) {
          return new BadRequestException(
            INVOICES_MESSAGES.ERROR.CONTRACT_NOT_SIGNED,
          );
        }

        if (job.price !== undefined) {
          const subtotal = toTwoDecimal(
            (dto.lineItems as InvoiceLineItem[]).reduce(
              (sum, item) => sum + item.quantity * item.unitPrice,
              0,
            ),
          );
          const { totalInvoiced } =
            await this.invoicesRepository.getPaidSummaryByJob(
              bId,
              new Types.ObjectId(dto.jobId),
            );
          if (toTwoDecimal(totalInvoiced + subtotal) > job.price + 0.001) {
            return new BadRequestException(
              INVOICES_MESSAGES.ERROR.JOB_AMOUNT_MISMATCH,
            );
          }
        }
      } else {
        const acceptedRequest =
          await this.requestsRepository.findAcceptedByClientId(client._id, bId);
        if (!acceptedRequest) {
          return new BadRequestException(
            INVOICES_MESSAGES.ERROR.REQUEST_NOT_ACCEPTED,
          );
        }
      }

      const totalAmount = this.computeInvoiceTotal(
        dto.lineItems as InvoiceLineItem[],
        dto.taxRate ?? 0,
      );

      // Retry up to 3 times on the rare duplicate-number collision
      const MAX_ATTEMPTS = 3;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const invoiceNumber = await this.generateInvoiceNumber(bId, attempt);
        try {
          const invoice = await this.invoicesRepository.create({
            businessId: bId,
            clientId: client._id,
            invoiceNumber,
            invoiceDate: new Date(dto.invoiceDate),
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
            lineItems: dto.lineItems as InvoiceLineItem[],
            taxRate: dto.taxRate ?? 0,
            totalAmount,
            amountPaid: 0,
            status: InvoiceStatus.PENDING,
            jobId: dto.jobId ? new Types.ObjectId(dto.jobId) : undefined,
            timezone: business.timezone,
          });
          await this.refreshClientBalance(client._id, bId);
          void this.invalidateInvoicesListCache(businessId);
          return invoice;
        } catch (err) {
          const isDuplicate =
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code?: number }).code === 11000;

          if (isDuplicate && attempt < MAX_ATTEMPTS - 1) continue;
          throw err;
        }
      }

      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } catch (error) {
      this.logger.error(
        `createInvoice: failed [businessId=${businessId}]: ${formatError(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async updateInvoice(
    id: string,
    businessId: string,
    dto: UpdateInvoiceDto,
  ): Promise<Invoice | NotFoundException | InternalServerErrorException> {
    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.invoicesRepository.findById(id, bId);
      if (!existing) {
        return new NotFoundException(INVOICES_MESSAGES.ERROR.NOT_FOUND);
      }

      const nextLineItems =
        dto.lineItems !== undefined
          ? (dto.lineItems as InvoiceLineItem[])
          : existing.lineItems;
      const nextTaxRate = dto.taxRate ?? existing.taxRate;

      const update: Partial<Invoice> = {
        ...(dto.dueDate !== undefined && {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        }),
        ...(dto.lineItems !== undefined && {
          lineItems: dto.lineItems as InvoiceLineItem[],
        }),
        ...(dto.taxRate !== undefined && { taxRate: dto.taxRate }),
      };

      if (dto.lineItems !== undefined || dto.taxRate !== undefined) {
        const totalAmount = this.computeInvoiceTotal(
          nextLineItems,
          nextTaxRate,
        );
        update.totalAmount = totalAmount;
        update.status = calculateInvoiceStatus(
          existing.amountPaid,
          totalAmount,
        );
        if (update.status === InvoiceStatus.PAID) {
          update.amountPaid = totalAmount;
        }
      }

      if (dto.status !== undefined) {
        update.status = dto.status;

        if (dto.status === InvoiceStatus.PAID) {
          update.amountPaid = update.totalAmount ?? existing.totalAmount;
        }
      }

      const updated = await this.invoicesRepository.updateById(id, bId, update);
      if (!updated) {
        return new NotFoundException(INVOICES_MESSAGES.ERROR.NOT_FOUND);
      }

      await this.refreshClientBalance(existing.clientId, bId);
      void this.invalidateInvoicesListCache(businessId);
      void this.redisService
        .del(invoiceDetailCacheKey(businessId, id))
        .catch(() => undefined);

      if (
        dto.status === InvoiceStatus.PAID &&
        existing.status !== InvoiceStatus.PAID
      ) {
        void this.agendaService
          .now<InvoiceAutoCreatePaymentJobData>(
            JOBS.INVOICE_AUTO_CREATE_PAYMENT,
            {
              businessId,
              invoiceId: id,
            },
          )
          .catch((err: unknown) =>
            this.logger.error(
              `updateInvoice: queue auto-payment failed [invoiceId=${id}]: ${formatErrorMessage(err)}`,
            ),
          );
      }

      return updated;
    } catch (error) {
      this.logger.error(
        `updateInvoice: failed [id=${id}, businessId=${businessId}]: ${formatError(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async deleteInvoice(
    id: string,
    businessId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const bId = new Types.ObjectId(businessId);
      const deleted = await this.invoicesRepository.softDelete(id, bId);
      if (!deleted) {
        return new NotFoundException(INVOICES_MESSAGES.ERROR.NOT_FOUND);
      }
      await this.refreshClientBalance(deleted.clientId, bId);
      void this.invalidateInvoicesListCache(businessId);
      void this.redisService
        .del(invoiceDetailCacheKey(businessId, id))
        .catch(() => undefined);
      return null;
    } catch (error) {
      this.logger.error(
        `deleteInvoice: failed [id=${id}, businessId=${businessId}]: ${formatError(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private async getListVersion(businessId: string): Promise<string> {
    const key = invoicesListVersionKey(businessId);
    const version = await this.redisService.get(key);
    if (version) return version;
    await this.redisService.set(key, '1', CACHE_TTL.INVOICES_LIST_VERSION);
    return '1';
  }

  private async invalidateInvoicesListCache(businessId: string): Promise<void> {
    await this.redisService
      .incr(invoicesListVersionKey(businessId))
      .catch((err: unknown) =>
        this.logger.warn(
          `invalidateInvoicesListCache: failed [businessId=${businessId}]: ${formatErrorMessage(err)}`,
        ),
      );
  }

  async getInvoicePdf(
    id: string,
    businessId: string,
  ): Promise<
    | { pdfUrl: string }
    | NotFoundException
    | InternalServerErrorException
    | BadRequestException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const invoice = await this.invoicesRepository.findById(id, bId, true);
      if (!invoice) {
        return new NotFoundException(INVOICES_MESSAGES.ERROR.NOT_FOUND);
      }

      const ensured = await this.ensureInvoicePdf(invoice, businessId);
      if (ensured instanceof BadRequestException) return ensured;
      if (ensured instanceof InternalServerErrorException) return ensured;

      return { pdfUrl: ensured.pdfUrl as string };
    } catch (error) {
      this.logger.error(
        `getInvoicePdf: failed [invoiceId=${id}, businessId=${businessId}]: ${formatError(error)}`,
      );
      return new InternalServerErrorException(
        INVOICES_MESSAGES.ERROR.PDF_FAILED,
      );
    }
  }

  /**
   * Queues the invoice email (PDF attached). With `reminderMessage`, the email
   * is sent as a payment reminder carrying that message instead.
   */
  async sendInvoice(
    id: string,
    businessId: string,
    options: { reminderMessage?: string } = {},
  ): Promise<
    | { invoiceId: string; queued: true }
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const invoice = await this.invoicesRepository.findById(
        id,
        new Types.ObjectId(businessId),
      );
      if (!invoice) {
        return new NotFoundException(INVOICES_MESSAGES.ERROR.NOT_FOUND);
      }

      await this.agendaService.now<InvoiceSendJobData>(JOBS.INVOICE_SEND, {
        businessId,
        invoiceId: id,
        ...(options.reminderMessage
          ? { reminderMessage: options.reminderMessage }
          : {}),
      });

      return { invoiceId: id, queued: true };
    } catch (error) {
      this.logger.error(
        `sendInvoice: failed [invoiceId=${id}, businessId=${businessId}]: ${formatError(error)}`,
      );
      return new InternalServerErrorException(
        INVOICES_MESSAGES.ERROR.SEND_FAILED,
      );
    }
  }

  async getPaidSummaryForJob(
    businessId: string,
    jobId: string,
  ): Promise<
    { amountPaid: number; totalInvoiced: number } | InternalServerErrorException
  > {
    try {
      return this.invoicesRepository.getPaidSummaryByJob(
        new Types.ObjectId(businessId),
        new Types.ObjectId(jobId),
      );
    } catch (error) {
      this.logger.error(
        `getPaidSummaryForJob: failed [jobId=${jobId}, businessId=${businessId}]: ${formatError(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private async refreshClientBalance(
    clientId: Types.ObjectId,
    businessId: Types.ObjectId,
  ): Promise<void> {
    try {
      const { outstandingBalance } =
        await this.invoicesRepository.getClientInvoiceSummary(
          businessId,
          clientId,
        );
      await this.clientsRepository.setBalance(
        clientId,
        businessId,
        outstandingBalance,
      );
    } catch (err) {
      this.logger.error(
        `refreshClientBalance: failed [clientId=${clientId.toString()}, businessId=${businessId.toString()}]: ${formatErrorMessage(err)}`,
      );
    }
  }

  private async handleInvoiceSendJob(
    payload: InvoiceSendJobData,
  ): Promise<void> {
    try {
      if (
        !payload ||
        !Types.ObjectId.isValid(payload.businessId) ||
        !Types.ObjectId.isValid(payload.invoiceId)
      ) {
        this.logger.warn(
          `handleInvoiceSendJob: invalid payload ${JSON.stringify(payload)}`,
        );
        return;
      }

      const invoice = await this.invoicesRepository.findById(
        payload.invoiceId,
        new Types.ObjectId(payload.businessId),
        true,
      );
      if (!invoice) return;

      const client = await this.resolveInvoiceClientPreview(
        invoice,
        new Types.ObjectId(payload.businessId),
      );
      if (!client) return;

      const ensured = await this.ensureInvoicePdf(invoice, payload.businessId);
      if (
        ensured instanceof BadRequestException ||
        ensured instanceof InternalServerErrorException
      ) {
        return;
      }

      const attachments = await this.buildInvoiceAttachment(
        ensured.pdfUrl as string,
      );
      const totalLabel = toTwoDecimal(ensured.totalAmount).toFixed(2);
      const reminder = payload.reminderMessage?.trim();

      await this.emailService.send({
        to: client.email,
        name: client.name,
        subject: reminder
          ? `Payment reminder: Invoice ${ensured.invoiceNumber}`
          : `Invoice ${ensured.invoiceNumber}`,
        html: reminder
          ? this.buildReminderEmailHtml(ensured, reminder)
          : `
          <div style="font-family: Arial, sans-serif; color: #111827;">
            <h2>Invoice ${ensured.invoiceNumber}</h2>
            <p>Hello ${client.name},</p>
            <p>Your invoice for this service is ready.</p>
            <p><strong>Total:</strong> ${totalLabel}</p>
            <p>You can access the PDF using the attached document or this link:</p>
            <p><a href="${ensured.pdfUrl}">${ensured.pdfUrl}</a></p>
          </div>
        `,
        attachments,
      });

      const sentAt = toBusinessLocalTime(new Date(), ensured.timezone);
      await this.invoicesRepository.updateById(
        ensured._id.toString(),
        new Types.ObjectId(payload.businessId),
        { sentAt },
      );
    } catch (error) {
      this.logger.error(`handleInvoiceSendJob: failed ${formatError(error)}`);
      throw error;
    }
  }

  private buildReminderEmailHtml(invoice: Invoice, message: string): string {
    const balanceLabel = toTwoDecimal(
      invoice.totalAmount - invoice.amountPaid,
    ).toFixed(2);

    return `
          <div style="font-family: Arial, sans-serif; color: #111827;">
            <h2>Payment reminder: Invoice ${escapeHtml(invoice.invoiceNumber)}</h2>
            <p>${textToHtml(message)}</p>
            <p><strong>Amount due:</strong> ${balanceLabel}</p>
            <p>You can access the invoice PDF using the attached document or this link:</p>
            <p><a href="${invoice.pdfUrl}">${invoice.pdfUrl}</a></p>
          </div>
        `;
  }

  private async ensureInvoicePdf(
    invoice: Invoice,
    businessId: string,
  ): Promise<Invoice | BadRequestException | InternalServerErrorException> {
    try {
      if (invoice.pdfUrl) {
        return invoice;
      }

      const html = this.buildInvoiceHtml(invoice);
      const pdfBuffer = await this.pdfService.renderHtmlToPdf(html);
      const uploaded = await this.uploadInvoicePdf(
        pdfBuffer,
        invoice.invoiceNumber,
      );

      const updated = await this.invoicesRepository.updateById(
        invoice._id.toString(),
        new Types.ObjectId(businessId),
        { pdfUrl: uploaded.secureUrl },
      );

      if (!updated) {
        return new InternalServerErrorException(
          INVOICES_MESSAGES.ERROR.PDF_FAILED,
        );
      }

      return updated;
    } catch (error) {
      this.logger.error(
        `ensureInvoicePdf: failed [invoiceId=${invoice._id.toString()}, businessId=${businessId}] ${formatError(error)}`,
      );
      return new InternalServerErrorException(
        INVOICES_MESSAGES.ERROR.PDF_FAILED,
      );
    }
  }

  /** Generates a sequential invoice number: INV-{YEAR}-{NNNN}. offset handles rare duplicate retries. */
  private async generateInvoiceNumber(
    businessId: Types.ObjectId,
    offset = 0,
  ): Promise<string> {
    const count = await this.invoicesRepository.countByBusiness(businessId);
    const year = new Date().getFullYear();
    const seq = String(count + 1 + offset).padStart(4, '0');
    return `INV-${year}-${seq}`;
  }

  private computeInvoiceTotal(
    lineItems: InvoiceLineItem[],
    taxRate: number,
  ): number {
    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const total = subtotal * (1 + taxRate / 100);
    return toTwoDecimal(total);
  }

  private buildInvoiceHtml(invoice: Invoice): string {
    const lineRows = invoice.lineItems
      .map((item) => {
        const rowTotal = toTwoDecimal(item.quantity * item.unitPrice).toFixed(
          2,
        );
        return `<tr>
          <td>${item.description}</td>
          <td style="text-align:right;">${item.quantity}</td>
          <td style="text-align:right;">${toTwoDecimal(item.unitPrice).toFixed(2)}</td>
          <td style="text-align:right;">${rowTotal}</td>
        </tr>`;
      })
      .join('');

    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${invoice.invoiceNumber}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
      h1 { margin-bottom: 6px; }
      .muted { color: #4b5563; margin: 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 14px; }
      th { background: #f3f4f6; text-align: left; }
      .totals { margin-top: 16px; text-align: right; }
      .totals p { margin: 4px 0; }
    </style>
  </head>
  <body>
    <h1>Invoice ${invoice.invoiceNumber}</h1>
    <p class="muted">Invoice Date: ${invoice.invoiceDate.toISOString()}</p>
    ${invoice.dueDate ? `<p class="muted">Due Date: ${invoice.dueDate.toISOString()}</p>` : ''}

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right;">Qty</th>
          <th style="text-align:right;">Unit Price</th>
          <th style="text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>

    <div class="totals">
      <p><strong>Tax Rate:</strong> ${toTwoDecimal(invoice.taxRate).toFixed(2)}%</p>
      <p><strong>Total Amount:</strong> ${toTwoDecimal(invoice.totalAmount).toFixed(2)}</p>
      <p><strong>Amount Paid:</strong> ${toTwoDecimal(invoice.amountPaid).toFixed(2)}</p>
    </div>
  </body>
</html>`;
  }

  private async uploadInvoicePdf(
    pdfBuffer: Buffer,
    invoiceNumber: string,
  ): Promise<{ secureUrl: string; publicId: string }> {
    const { url, publicId } = await this.storageService.uploadBuffer(
      pdfBuffer,
      STORAGE_FOLDERS.invoices,
      `${invoiceNumber}.pdf`,
    );
    return { secureUrl: url, publicId };
  }

  private async buildInvoiceAttachment(pdfUrl: string): Promise<
    | Array<{
        ContentType: string;
        Filename: string;
        Base64Content: string;
      }>
    | undefined
  > {
    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) return undefined;

      const bytes = await response.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');

      return [
        {
          ContentType: 'application/pdf',
          Filename: 'invoice.pdf',
          Base64Content: base64,
        },
      ];
    } catch {
      return undefined;
    }
  }

  private async resolveInvoiceClientPreview(
    invoice: Invoice,
    businessId: Types.ObjectId,
  ): Promise<InvoiceClientPreview | null> {
    const maybeClient = invoice.clientId as unknown;
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
      invoice.clientId.toString(),
      businessId,
    );
    if (!client) return null;

    return {
      _id: client._id,
      name: client.name,
      email: client.email,
    };
  }
}
