import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { JOBS } from 'src/common/constants/agenda.constants';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { ClientsRepository } from 'src/modules/clients/repositories/clients.repository';
import { EmailService } from 'src/modules/email/services/email.service';
import { InvoicesRepository } from 'src/modules/invoices/repositories/invoices.repository';
import { InvoicesService } from 'src/modules/invoices/services/invoices.service';
import {
  Invoice,
  InvoiceStatus,
} from 'src/modules/invoices/schemas/invoice.schema';
import { StorageService } from 'src/modules/storage/storage.service';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = '664abc123456789012345678';
const CLIENT_ID = '664abc000000000000000001';
const INVOICE_ID = '664abc000000000000000002';

const baseInvoice: Invoice = {
  _id: new Types.ObjectId(INVOICE_ID),
  businessId: new Types.ObjectId(BUSINESS_ID),
  clientId: new Types.ObjectId(CLIENT_ID),
  invoiceNumber: 'INV-0001',
  status: InvoiceStatus.PENDING,
  invoiceDate: new Date('2026-05-08T10:00:00.000Z'),
  lineItems: [
    {
      description: 'Service',
      quantity: 2,
      unitPrice: 50,
    },
  ],
  taxRate: 0,
  totalAmount: 100,
  amountPaid: 0,
  timezone: 'America/New_York',
};

describe('InvoicesService', () => {
  let service: InvoicesService;
  let invoicesRepository: {
    findAll: jest.Mock;
    findByInvoiceNumber: jest.Mock;
    countByBusiness: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
    getPaidSummaryByJob: jest.Mock;
  };
  let clientsRepository: {
    findById: jest.Mock;
  };
  let businessRepository: {
    findById: jest.Mock;
  };
  let agendaService: {
    define: jest.Mock;
    now: jest.Mock;
  };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    invoicesRepository = {
      findAll: jest.fn().mockResolvedValue({
        data: [baseInvoice],
        total: 1,
        statistics: {
          totalCollected: 20,
          outstanding: 80,
        },
      }),
      findByInvoiceNumber: jest.fn().mockResolvedValue(null),
      countByBusiness: jest.fn().mockResolvedValue(10),
      findById: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
      getPaidSummaryByJob: jest
        .fn()
        .mockResolvedValue({ amountPaid: 120, totalInvoiced: 200 }),
    };
    clientsRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(CLIENT_ID),
      }),
    };
    businessRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(BUSINESS_ID),
        name: 'Acme',
        timezone: 'America/New_York',
      }),
    };
    agendaService = {
      define: jest.fn(),
      now: jest.fn().mockResolvedValue(undefined),
    };

    service = new InvoicesService(
      asMock<InvoicesRepository>(invoicesRepository),
      asMock<ClientsRepository>(clientsRepository),
      asMock<BusinessRepository>(businessRepository),
      asMock<AgendaService>(agendaService),
      {} as EmailService,
      {} as StorageService,
    );

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('creates invoice and computes total amount server-side', async () => {
    invoicesRepository.create.mockResolvedValue({
      ...baseInvoice,
      totalAmount: 108.5,
      taxRate: 8.5,
    });

    const result = await service.createInvoice(BUSINESS_ID, {
      clientId: CLIENT_ID,
      invoiceDate: '2026-05-08T10:00:00.000Z',
      dueDate: '2026-05-14T10:00:00.000Z',
      lineItems: [{ description: 'Labour', quantity: 1, unitPrice: 100 }],
      taxRate: 8.5,
    });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 108.5,
        amountPaid: 0,
        status: InvoiceStatus.PENDING,
      }),
    );
    expect(result).not.toBeInstanceOf(InternalServerErrorException);
  });

  it('returns 500 when all retry attempts fail with a duplicate key error', async () => {
    const dupError = Object.assign(new Error('duplicate key'), { code: 11000 });
    invoicesRepository.create.mockRejectedValue(dupError);

    const result = await service.createInvoice(BUSINESS_ID, {
      clientId: CLIENT_ID,
      invoiceDate: '2026-05-08T10:00:00.000Z',
      lineItems: [{ description: 'Labour', quantity: 1, unitPrice: 100 }],
      taxRate: 0,
    });

    expect(result).toBeInstanceOf(InternalServerErrorException);
  });

  it('queues auto-payment creation when status transitions to paid', async () => {
    invoicesRepository.findById.mockResolvedValueOnce(baseInvoice);
    invoicesRepository.updateById.mockResolvedValueOnce({
      ...baseInvoice,
      status: InvoiceStatus.PAID,
      amountPaid: 100,
    });

    const result = await service.updateInvoice(INVOICE_ID, BUSINESS_ID, {
      status: InvoiceStatus.PAID,
    });

    expect(agendaService.now).toHaveBeenCalledWith(
      JOBS.INVOICE_AUTO_CREATE_PAYMENT,
      {
        businessId: BUSINESS_ID,
        invoiceId: INVOICE_ID,
      },
    );
    expect(result).not.toBeInstanceOf(NotFoundException);
  });

  it('returns paid summary for job', async () => {
    const result = await service.getPaidSummaryForJob(BUSINESS_ID, INVOICE_ID);
    if (result instanceof InternalServerErrorException) {
      throw new Error('Expected summary result');
    }

    expect(result.amountPaid).toBe(120);
    expect(result.totalInvoiced).toBe(200);
  });

  it('returns list payload with statistics and pagination', async () => {
    const result = await service.listInvoices(BUSINESS_ID, {
      page: 1,
      limit: 6,
      search: 'INV',
    });

    if (result instanceof InternalServerErrorException) {
      throw new Error('Expected invoice list result');
    }

    expect(invoicesRepository.findAll).toHaveBeenCalledWith(
      new Types.ObjectId(BUSINESS_ID),
      expect.objectContaining({ search: 'INV' }),
      expect.objectContaining({ page: 1, limit: 6 }),
    );
    expect(result.statistics).toEqual({
      totalCollected: 20,
      outstanding: 80,
    });
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('returns 500 when repository fails unexpectedly', async () => {
    invoicesRepository.findById.mockRejectedValue(new Error('db crash'));

    const result = await service.getInvoice(INVOICE_ID, BUSINESS_ID);

    expect(result).toBeInstanceOf(InternalServerErrorException);
    expect((result as InternalServerErrorException).message).toBe(
      COMMON_MESSAGES.ERROR.INTERNAL,
    );
  });
});
