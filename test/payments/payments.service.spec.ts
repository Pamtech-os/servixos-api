import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { JOBS } from 'src/common/constants/agenda.constants';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { InvoicesRepository } from 'src/modules/invoices/repositories/invoices.repository';
import { InvoiceStatus } from 'src/modules/invoices/schemas/invoice.schema';
import { PaymentsRepository } from 'src/modules/payments/repositories/payments.repository';
import { PaymentsService } from 'src/modules/payments/services/payments.service';
import {
  Payment,
  PaymentMode,
  PaymentStatus,
} from 'src/modules/payments/schemas/payment.schema';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = '664abc123456789012345678';
const INVOICE_ID = '664abc000000000000000001';
const CLIENT_ID = '664abc000000000000000002';
const PAYMENT_ID = '664abc000000000000000003';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepository: {
    findAll: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    softDelete: jest.Mock;
    sumPaidForInvoice: jest.Mock;
    hasLinkedPayment: jest.Mock;
  };
  let invoicesRepository: {
    findById: jest.Mock;
    updateById: jest.Mock;
    getReceivablesStatistics: jest.Mock;
  };
  let businessRepository: {
    findById: jest.Mock;
  };
  let agendaService: {
    define: jest.Mock;
  };
  let connection: {
    startSession: jest.Mock;
  };
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection = {
      startSession: jest.fn().mockResolvedValue(session),
    };

    paymentsRepository = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      create: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      softDelete: jest.fn(),
      sumPaidForInvoice: jest.fn().mockResolvedValue(0),
      hasLinkedPayment: jest.fn().mockResolvedValue(false),
    };
    invoicesRepository = {
      findById: jest.fn(),
      updateById: jest.fn(),
      getReceivablesStatistics: jest.fn().mockResolvedValue({
        totalIncome: 1000,
        received: 400,
        pending: 300,
        overdue: 300,
        outstanding: 600,
      }),
    };
    businessRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(BUSINESS_ID),
        name: 'Acme Repairs',
        timezone: 'America/New_York',
      }),
    };
    agendaService = {
      define: jest.fn(),
    };

    service = new PaymentsService(
      connection as never,
      asMock<PaymentsRepository>(paymentsRepository),
      asMock<InvoicesRepository>(invoicesRepository),
      asMock<BusinessRepository>(businessRepository),
      asMock<AgendaService>(agendaService),
    );

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('records payment and updates linked invoice amountPaid/status', async () => {
    invoicesRepository.findById.mockResolvedValueOnce({
      _id: new Types.ObjectId(INVOICE_ID),
      clientId: new Types.ObjectId(CLIENT_ID),
      totalAmount: 100,
      amountPaid: 0,
      timezone: 'America/New_York',
    });
    paymentsRepository.create.mockResolvedValueOnce({
      _id: new Types.ObjectId(PAYMENT_ID),
      amount: 50,
    } as Payment);

    const result = await service.createPayment(BUSINESS_ID, {
      invoiceId: INVOICE_ID,
      paymentDate: '2026-05-08T10:00:00.000Z',
      paymentMode: PaymentMode.BANK_TRANSFER,
      amount: 50,
      status: PaymentStatus.PARTIAL,
    });

    expect(invoicesRepository.updateById).toHaveBeenCalledWith(
      INVOICE_ID,
      expect.any(Types.ObjectId),
      expect.objectContaining({
        amountPaid: 50,
        status: InvoiceStatus.PARTIAL,
      }),
      session,
    );
    expect(result).not.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects overpayment attempts', async () => {
    invoicesRepository.findById.mockResolvedValueOnce({
      _id: new Types.ObjectId(INVOICE_ID),
      clientId: new Types.ObjectId(CLIENT_ID),
      totalAmount: 100,
      amountPaid: 30,
      timezone: 'America/New_York',
    });

    const result = await service.createPayment(BUSINESS_ID, {
      invoiceId: INVOICE_ID,
      paymentDate: '2026-05-08T10:00:00.000Z',
      paymentMode: PaymentMode.BANK_TRANSFER,
      amount: 90,
    });

    expect(result).toBeInstanceOf(BadRequestException);
    expect(paymentsRepository.create).not.toHaveBeenCalled();
  });

  it('returns 404 when payment does not exist on update', async () => {
    paymentsRepository.findById.mockResolvedValueOnce(null);

    const result = await service.updatePayment(PAYMENT_ID, BUSINESS_ID, {
      amount: 50,
    });

    expect(result).toBeInstanceOf(NotFoundException);
  });

  it('registers auto-payment queue worker on module init', () => {
    service.onModuleInit();

    expect(agendaService.define).toHaveBeenCalledWith(
      JOBS.INVOICE_AUTO_CREATE_PAYMENT,
      expect.any(Function),
    );
  });

  it('returns list payload with receivable statistics and payment filters', async () => {
    paymentsRepository.findAll.mockResolvedValueOnce({
      data: [
        {
          _id: new Types.ObjectId(PAYMENT_ID),
          businessId: new Types.ObjectId(BUSINESS_ID),
          clientId: new Types.ObjectId(CLIENT_ID),
          paymentMode: PaymentMode.CASH,
          paymentDate: new Date('2026-05-08T10:00:00.000Z'),
          amount: 100,
          status: PaymentStatus.COMPLETED,
          timezone: 'America/New_York',
        },
      ],
      total: 1,
    });

    const result = await service.listPayments(BUSINESS_ID, {
      page: 1,
      limit: 20,
      search: 'CaSh',
    });

    if (result instanceof InternalServerErrorException) {
      throw new Error('Expected list payments result');
    }

    expect(paymentsRepository.findAll).toHaveBeenCalledWith(
      new Types.ObjectId(BUSINESS_ID),
      expect.objectContaining({ search: 'CaSh' }),
      expect.objectContaining({ page: 1, limit: 20 }),
    );
    expect(invoicesRepository.getReceivablesStatistics).toHaveBeenCalledWith(
      new Types.ObjectId(BUSINESS_ID),
      expect.any(Date),
    );
    expect(result.statistics).toEqual({
      totalIncome: 1000,
      received: 400,
      pending: 300,
      overdue: 300,
      outstanding: 600,
    });
    expect(result.meta.total).toBe(1);
  });

  it('returns 500 when listing payments throws unexpectedly', async () => {
    paymentsRepository.findAll.mockRejectedValueOnce(new Error('db crash'));

    const result = await service.listPayments(BUSINESS_ID, {});

    expect(result).toBeInstanceOf(InternalServerErrorException);
    expect((result as InternalServerErrorException).message).toBe(
      COMMON_MESSAGES.ERROR.INTERNAL,
    );
  });
});
