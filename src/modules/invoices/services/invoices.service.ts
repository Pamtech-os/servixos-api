import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job as AgendaJob } from 'agenda';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { INVOICES_MESSAGES } from 'src/common/constants/messages/invoices.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { toBusinessLocalTime } from 'src/common/utils/timezone.util';
import { toTwoDecimal } from 'src/common/utils/number.util';
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

interface PaginatedInvoices {
  statistics: InvoiceListStatistics;
  data: Invoice[];
  meta: ReturnType<typeof buildMeta>;
}

interface ContractUploadResult {
  secureUrl: string;
  publicId: string;
}

interface InvoiceClientPreview {
  _id: Types.ObjectId;
  name: string;
  email: string;
}

@Injectable()
export class InvoicesService implements OnModuleInit {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly cloudinaryCloudName: string;
  private readonly cloudinaryApiKey: string;
  private readonly cloudinaryApiSecret: string;
  private readonly cloudinaryFolder: string;

  constructor(
    config: ConfigService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly agendaService: AgendaService,
    private readonly emailService: EmailService,
  ) {
    this.cloudinaryCloudName =
      config.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
    this.cloudinaryApiKey = config.get<string>('CLOUDINARY_API_KEY') ?? '';
    this.cloudinaryApiSecret =
      config.get<string>('CLOUDINARY_API_SECRET') ?? '';
    this.cloudinaryFolder =
      config.get<string>('CLOUDINARY_INVOICES_FOLDER') ?? 'servixos/invoices';
  }

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
      const { data, total, statistics } = await this.invoicesRepository.findAll(
        new Types.ObjectId(businessId),
        {
          search: dto.search,
          clientId: dto.clientId,
          status: dto.status,
        },
        pagination,
      );

      return {
        statistics,
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    } catch (error) {
      this.logger.error(
        `listInvoices: failed [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getInvoice(
    id: string,
    businessId: string,
  ): Promise<Invoice | NotFoundException | InternalServerErrorException> {
    try {
      const invoice = await this.invoicesRepository.findById(
        id,
        new Types.ObjectId(businessId),
        true,
      );
      if (!invoice) {
        return new NotFoundException(INVOICES_MESSAGES.ERROR.NOT_FOUND);
      }

      return invoice;
    } catch (error) {
      this.logger.error(
        `getInvoice: failed [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createInvoice(
    businessId: string,
    dto: CreateInvoiceDto,
  ): Promise<
    | Invoice
    | ConflictException
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      if (!dto.lineItems?.length) {
        return new BadRequestException(INVOICES_MESSAGES.ERROR.NO_LINE_ITEMS);
      }

      const bId = new Types.ObjectId(businessId);
      const [business, client, existingNumber] = await Promise.all([
        this.businessRepository.findById(businessId),
        this.clientsRepository.findById(dto.clientId, bId),
        this.invoicesRepository.findByInvoiceNumber(bId, dto.invoiceNumber),
      ]);

      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }
      if (!client) {
        return new NotFoundException(INVOICES_MESSAGES.ERROR.CLIENT_NOT_FOUND);
      }
      if (existingNumber) {
        return new ConflictException(INVOICES_MESSAGES.ERROR.NUMBER_TAKEN);
      }

      const totalAmount = this.computeInvoiceTotal(
        dto.lineItems as InvoiceLineItem[],
        dto.taxRate ?? 0,
      );

      const invoice = await this.invoicesRepository.create({
        businessId: bId,
        clientId: client._id,
        invoiceNumber: dto.invoiceNumber.trim(),
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

      return invoice;
    } catch (error) {
      const duplicateKeyError =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === 11000;

      if (duplicateKeyError) {
        return new ConflictException(INVOICES_MESSAGES.ERROR.NUMBER_TAKEN);
      }

      this.logger.error(
        `createInvoice: failed [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
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

        if (existing.amountPaid >= totalAmount) {
          update.amountPaid = totalAmount;
          update.status = InvoiceStatus.PAID;
        } else if (existing.amountPaid > 0) {
          update.status = InvoiceStatus.PARTIAL;
        } else {
          update.status = InvoiceStatus.PENDING;
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
              `updateInvoice: queue auto-payment failed [invoiceId=${id}]: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      }

      return updated;
    } catch (error) {
      this.logger.error(
        `updateInvoice: failed [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async deleteInvoice(
    id: string,
    businessId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const deleted = await this.invoicesRepository.softDelete(
        id,
        new Types.ObjectId(businessId),
      );
      if (!deleted) {
        return new NotFoundException(INVOICES_MESSAGES.ERROR.NOT_FOUND);
      }
      return null;
    } catch (error) {
      this.logger.error(
        `deleteInvoice: failed [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
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
        `getInvoicePdf: failed [invoiceId=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        INVOICES_MESSAGES.ERROR.PDF_FAILED,
      );
    }
  }

  async sendInvoice(
    id: string,
    businessId: string,
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
      });

      return { invoiceId: id, queued: true };
    } catch (error) {
      this.logger.error(
        `sendInvoice: failed [invoiceId=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
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
        `getPaidSummaryForJob: failed [jobId=${jobId}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
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

      await this.emailService.send({
        to: client.email,
        name: client.name,
        subject: `Invoice ${ensured.invoiceNumber}`,
        html: `
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
      this.logger.error(
        `handleInvoiceSendJob: failed ${error instanceof Error ? error.stack : String(error)}`,
      );
      throw error;
    }
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
      const pdfBuffer = await this.renderInvoicePdfBuffer(html);
      const uploaded = await this.uploadInvoicePdf(
        pdfBuffer,
        businessId,
        invoice._id.toString(),
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
        `ensureInvoicePdf: failed [invoiceId=${invoice._id.toString()}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        INVOICES_MESSAGES.ERROR.PDF_FAILED,
      );
    }
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

  private async renderInvoicePdfBuffer(html: string): Promise<Buffer> {
    const modulePath = 'puppeteer';
    const imported = (await import(modulePath)) as { default?: unknown };
    const puppeteer = imported.default as {
      launch: (options: {
        headless: boolean | 'new';
        args?: string[];
      }) => Promise<{
        newPage: () => Promise<{
          setContent: (
            html: string,
            options: { waitUntil: 'networkidle0' },
          ) => Promise<void>;
          pdf: (options: {
            format: 'A4';
            printBackground: boolean;
          }) => Promise<Buffer>;
        }>;
        close: () => Promise<void>;
      }>;
    };

    if (!puppeteer || typeof puppeteer.launch !== 'function') {
      throw new Error('Puppeteer module is not available');
    }

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      return await page.pdf({ format: 'A4', printBackground: true });
    } finally {
      await browser.close();
    }
  }

  private async uploadInvoicePdf(
    pdfBuffer: Buffer,
    businessId: string,
    invoiceId: string,
    invoiceNumber: string,
  ): Promise<ContractUploadResult> {
    if (
      !this.cloudinaryCloudName ||
      !this.cloudinaryApiKey ||
      !this.cloudinaryApiSecret
    ) {
      throw new Error('Cloudinary credentials are not configured');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `${businessId}-${invoiceId}-${timestamp}`;
    const signatureBase = `folder=${this.cloudinaryFolder}&public_id=${publicId}&timestamp=${timestamp}`;
    const signature = createHash('sha1')
      .update(`${signatureBase}${this.cloudinaryApiSecret}`)
      .digest('hex');

    const form = new FormData();
    form.append('file', new Blob([pdfBuffer]), `${invoiceNumber}.pdf`);
    form.append('api_key', this.cloudinaryApiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', this.cloudinaryFolder);
    form.append('public_id', publicId);
    form.append('signature', signature);
    form.append('resource_type', 'raw');

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudinaryCloudName}/raw/upload`,
      {
        method: 'POST',
        body: form,
      },
    );

    const payload = (await response.json()) as {
      secure_url?: string;
      public_id?: string;
      error?: { message?: string };
    };

    if (!response.ok || !payload.secure_url || !payload.public_id) {
      throw new Error(payload.error?.message ?? 'Service failed unexpectedly');
    }

    return {
      secureUrl: payload.secure_url,
      publicId: payload.public_id,
    };
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
