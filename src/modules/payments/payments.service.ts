import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Job as AgendaJob } from 'agenda';
import { ClientSession, Connection, Types } from 'mongoose';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { PAYMENTS_MESSAGES } from 'src/common/constants/messages/payments.messages';
import { toTwoDecimal } from 'src/common/utils/number.util';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { JOBS } from '../agenda/agenda.constants';
import { AgendaService } from '../agenda/agenda.service';
import { BusinessRepository } from '../business/business.repository';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { InvoiceAutoCreatePaymentJobData } from '../invoices/invoices.types';
import {
  InvoiceReceivablesStatistics,
  InvoicesRepository,
} from '../invoices/invoices.repository';
import { InvoiceStatus } from '../invoices/schemas/invoice.schema';
import { PaymentsRepository } from './payments.repository';
import { Payment, PaymentMode, PaymentStatus } from './schemas/payment.schema';

interface PaginatedPayments {
  statistics: InvoiceReceivablesStatistics;
  data: Payment[];
  meta: ReturnType<typeof buildMeta>;
}

const EPSILON = 0.000001;

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly paymentsRepository: PaymentsRepository,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly agendaService: AgendaService,
  ) {}

  onModuleInit(): void {
    this.agendaService.define(
      JOBS.INVOICE_AUTO_CREATE_PAYMENT,
      async (job: AgendaJob): Promise<void> => {
        const payload = job.attrs.data as InvoiceAutoCreatePaymentJobData;
        await this.handleAutoCreatePaymentForPaidInvoice(payload);
      },
    );
  }

  async listPayments(
    businessId: string,
    dto: ListPaymentsDto,
  ): Promise<PaginatedPayments | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const bId = new Types.ObjectId(businessId);
      const [business, paymentList] = await Promise.all([
        this.businessRepository.findById(businessId),
        this.paymentsRepository.findAll(
          bId,
          {
            search: dto.search,
            status: dto.status,
            paymentMode: dto.paymentMode,
            dateFrom: dto.dateFrom ? new Date(dto.dateFrom) : undefined,
            dateTo: dto.dateTo ? new Date(dto.dateTo) : undefined,
          },
          pagination,
        ),
      ]);

      const asOf =
        business && !business.deletedAt
          ? this.toBusinessLocalTime(new Date(), business.timezone)
          : new Date();
      const statistics = await this.invoicesRepository.getReceivablesStatistics(
        bId,
        asOf,
      );

      return {
        statistics,
        data: paymentList.data,
        meta: buildMeta(pagination.page, pagination.limit, paymentList.total),
      };
    } catch (error) {
      this.logger.error(
        `listPayments: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getPayment(
    id: string,
    businessId: string,
  ): Promise<Payment | NotFoundException | InternalServerErrorException> {
    try {
      const payment = await this.paymentsRepository.findById(
        id,
        new Types.ObjectId(businessId),
      );
      if (!payment) {
        return new NotFoundException(PAYMENTS_MESSAGES.ERROR.NOT_FOUND);
      }
      return payment;
    } catch (error) {
      this.logger.error(
        `getPayment: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createPayment(
    businessId: string,
    dto: CreatePaymentDto,
  ): Promise<
    | Payment
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const bId = new Types.ObjectId(businessId);
      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        await session.abortTransaction();
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const localPaymentDate = this.toBusinessLocalTime(
        new Date(dto.paymentDate),
        business.timezone,
      );

      if (!dto.invoiceId) {
        const created = await this.paymentsRepository.create(
          {
            businessId: bId,
            clientId: dto.clientId
              ? new Types.ObjectId(dto.clientId)
              : undefined,
            paymentDate: localPaymentDate,
            paymentMode: dto.paymentMode,
            amount: toTwoDecimal(dto.amount),
            status: dto.status ?? PaymentStatus.COMPLETED,
            notes: dto.notes,
            businessName: business.name,
            timezone: business.timezone,
          },
          session,
        );

        await session.commitTransaction();
        return created;
      }

      const invoice = await this.invoicesRepository.findById(
        dto.invoiceId,
        bId,
      );
      if (!invoice) {
        await session.abortTransaction();
        return new NotFoundException(PAYMENTS_MESSAGES.ERROR.INVOICE_NOT_FOUND);
      }

      const remaining = toTwoDecimal(invoice.totalAmount - invoice.amountPaid);
      if (dto.amount - remaining > EPSILON) {
        await session.abortTransaction();
        return new BadRequestException(
          PAYMENTS_MESSAGES.ERROR.OVERPAYMENT_NOT_ALLOWED,
        );
      }

      const nextPaid = toTwoDecimal(invoice.amountPaid + dto.amount);
      const nextInvoiceStatus =
        nextPaid + EPSILON >= invoice.totalAmount
          ? InvoiceStatus.PAID
          : nextPaid > 0
            ? InvoiceStatus.PARTIAL
            : InvoiceStatus.PENDING;
      const paymentStatus =
        dto.status ??
        (nextInvoiceStatus === InvoiceStatus.PAID
          ? PaymentStatus.COMPLETED
          : PaymentStatus.PARTIAL);

      const created = await this.paymentsRepository.create(
        {
          businessId: bId,
          invoiceId: invoice._id,
          clientId: dto.clientId
            ? new Types.ObjectId(dto.clientId)
            : invoice.clientId,
          paymentDate: localPaymentDate,
          paymentMode: dto.paymentMode,
          amount: toTwoDecimal(dto.amount),
          status: paymentStatus,
          notes: dto.notes,
          businessName: business.name,
          timezone: business.timezone,
        },
        session,
      );

      await this.invoicesRepository.updateById(
        invoice._id.toString(),
        bId,
        { amountPaid: nextPaid, status: nextInvoiceStatus },
        session,
      );

      await session.commitTransaction();
      return created;
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(
        `createPayment: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  async updatePayment(
    id: string,
    businessId: string,
    dto: UpdatePaymentDto,
  ): Promise<
    | Payment
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.paymentsRepository.findById(id, bId);
      if (!existing) {
        await session.abortTransaction();
        return new NotFoundException(PAYMENTS_MESSAGES.ERROR.NOT_FOUND);
      }

      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        await session.abortTransaction();
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const nextInvoiceIdRaw =
        dto.invoiceId !== undefined
          ? dto.invoiceId
          : existing.invoiceId?.toString();
      const nextAmount = dto.amount ?? existing.amount;

      if (nextInvoiceIdRaw) {
        const nextInvoice = await this.invoicesRepository.findById(
          nextInvoiceIdRaw,
          bId,
          false,
          session,
        );
        if (!nextInvoice) {
          await session.abortTransaction();
          return new NotFoundException(
            PAYMENTS_MESSAGES.ERROR.INVOICE_NOT_FOUND,
          );
        }

        const currentTotal = await this.paymentsRepository.sumPaidForInvoice(
          bId,
          nextInvoice._id,
          session,
        );

        const currentContribution =
          existing.invoiceId?.toString() === nextInvoiceIdRaw
            ? existing.amount
            : 0;

        const adjustedTotal = toTwoDecimal(
          currentTotal - currentContribution + nextAmount,
        );
        if (adjustedTotal - nextInvoice.totalAmount > EPSILON) {
          await session.abortTransaction();
          return new BadRequestException(
            PAYMENTS_MESSAGES.ERROR.OVERPAYMENT_NOT_ALLOWED,
          );
        }
      }

      const updated = await this.paymentsRepository.updateById(
        id,
        bId,
        {
          ...(dto.invoiceId !== undefined && {
            invoiceId: dto.invoiceId
              ? new Types.ObjectId(dto.invoiceId)
              : undefined,
          }),
          ...(dto.clientId !== undefined && {
            clientId: dto.clientId
              ? new Types.ObjectId(dto.clientId)
              : undefined,
          }),
          ...(dto.paymentDate !== undefined && {
            paymentDate: this.toBusinessLocalTime(
              new Date(dto.paymentDate),
              business.timezone,
            ),
          }),
          ...(dto.paymentMode !== undefined && {
            paymentMode: dto.paymentMode,
          }),
          ...(dto.amount !== undefined && { amount: toTwoDecimal(dto.amount) }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
        session,
      );

      if (!updated) {
        await session.abortTransaction();
        return new NotFoundException(PAYMENTS_MESSAGES.ERROR.NOT_FOUND);
      }

      const affectedInvoiceIds = new Set<string>();
      if (existing.invoiceId)
        affectedInvoiceIds.add(existing.invoiceId.toString());
      if (updated.invoiceId)
        affectedInvoiceIds.add(updated.invoiceId.toString());

      for (const invoiceId of affectedInvoiceIds) {
        await this.recalculateInvoicePaymentState(invoiceId, bId, session);
      }

      await session.commitTransaction();
      return updated;
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(
        `updatePayment: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  async deletePayment(
    id: string,
    businessId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const bId = new Types.ObjectId(businessId);
      const existing = await this.paymentsRepository.findById(id, bId);
      if (!existing) {
        await session.abortTransaction();
        return new NotFoundException(PAYMENTS_MESSAGES.ERROR.NOT_FOUND);
      }

      const deleted = await this.paymentsRepository.softDelete(
        id,
        bId,
        session,
      );
      if (!deleted) {
        await session.abortTransaction();
        return new NotFoundException(PAYMENTS_MESSAGES.ERROR.NOT_FOUND);
      }

      if (existing.invoiceId) {
        await this.recalculateInvoicePaymentState(
          existing.invoiceId.toString(),
          bId,
          session,
        );
      }

      await session.commitTransaction();
      return null;
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(
        `deletePayment: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  private async handleAutoCreatePaymentForPaidInvoice(
    payload: InvoiceAutoCreatePaymentJobData,
  ): Promise<void> {
    try {
      if (
        !payload ||
        !Types.ObjectId.isValid(payload.businessId) ||
        !Types.ObjectId.isValid(payload.invoiceId)
      ) {
        this.logger.warn(
          `handleAutoCreatePaymentForPaidInvoice: invalid payload ${JSON.stringify(payload)}`,
        );
        return;
      }

      const bId = new Types.ObjectId(payload.businessId);
      const invoice = await this.invoicesRepository.findById(
        payload.invoiceId,
        bId,
      );
      if (!invoice || invoice.status !== InvoiceStatus.PAID) return;

      const hasLinked = await this.paymentsRepository.hasLinkedPayment(
        bId,
        invoice._id,
      );
      if (hasLinked) return;

      const business = await this.businessRepository.findById(
        payload.businessId,
      );
      if (!business || business.deletedAt) return;

      const sumExisting = await this.paymentsRepository.sumPaidForInvoice(
        bId,
        invoice._id,
      );

      const fallbackAmount =
        invoice.amountPaid > 0 ? invoice.amountPaid : invoice.totalAmount;
      const remaining = toTwoDecimal(invoice.totalAmount - sumExisting);
      const autoAmount =
        remaining > EPSILON ? remaining : toTwoDecimal(fallbackAmount);

      if (autoAmount <= 0) return;

      await this.paymentsRepository.create({
        businessId: bId,
        invoiceId: invoice._id,
        clientId: invoice.clientId,
        paymentDate: this.toBusinessLocalTime(new Date(), invoice.timezone),
        paymentMode: PaymentMode.BANK_TRANSFER,
        amount: autoAmount,
        status: PaymentStatus.COMPLETED,
        notes: 'Auto-created from invoice status update to paid',
        businessName: business.name,
        timezone: invoice.timezone,
      });

      await this.recalculateInvoicePaymentState(payload.invoiceId, bId);
    } catch (error) {
      this.logger.error(
        `handleAutoCreatePaymentForPaidInvoice: failed ${error instanceof Error ? error.stack : String(error)}`,
      );
      throw error;
    }
  }

  private async recalculateInvoicePaymentState(
    invoiceId: string,
    businessId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const invoice = await this.invoicesRepository.findById(
      invoiceId,
      businessId,
      false,
      session,
    );
    if (!invoice) return;

    const totalPaid = await this.paymentsRepository.sumPaidForInvoice(
      businessId,
      invoice._id,
      session,
    );
    const amountPaid = toTwoDecimal(Math.min(totalPaid, invoice.totalAmount));

    const status =
      amountPaid + EPSILON >= invoice.totalAmount
        ? InvoiceStatus.PAID
        : amountPaid > 0
          ? InvoiceStatus.PARTIAL
          : InvoiceStatus.PENDING;

    await this.invoicesRepository.updateById(
      invoiceId,
      businessId,
      { amountPaid, status },
      session,
    );
  }

  /**
   * Stores dates in business-local wall-clock for globally distributed tenants.
   *
   * Example:
   * - utcDate: 2026-05-08T15:00:00.000Z
   * - timezone: America/New_York (UTC-4)
   * - stored: 2026-05-08T11:00:00.000Z
   */
  private toBusinessLocalTime(utcDate: Date, timezone: string): Date {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(utcDate);

      const p: Record<string, string> = {};
      for (const part of parts) {
        p[part.type] = part.value;
      }

      const hour = p['hour'] === '24' ? '00' : p['hour'];
      return new Date(
        `${p['year']}-${p['month']}-${p['day']}T${hour}:${p['minute']}:${p['second']}Z`,
      );
    } catch {
      return utcDate;
    }
  }
}
