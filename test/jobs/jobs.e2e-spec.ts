import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import {
  MongoDBContainer,
  StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Connection, Types } from 'mongoose';
import { Server } from 'http';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app';
import { signRequest } from '../helpers/sign-request';
import { AgendaService } from 'src/modules/agenda/agenda.service';
import { JOBS } from 'src/modules/agenda/agenda.constants';
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';
import { JOBS_MESSAGES } from 'src/common/constants/messages/jobs.messages';
import {
  PaymentMode,
  PaymentStatus,
} from 'src/modules/payments/schemas/payment.schema';

interface ApiBody<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface LoginPayload {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    businessId: string;
    subdomain?: string;
  };
}

interface EmailJobArgs {
  to: string;
  otp?: string;
}

const OWNER = {
  firstName: 'Job',
  lastName: 'Owner',
  email: 'jobs-owner@test.local',
  phone: '+12025550119',
  password: 'Password123',
  pin: '1122',
};

describe('Jobs (integration)', () => {
  let app: INestApplication;
  let clientToken: string;
  let dbConnection: Connection;
  let nowSpy: jest.Mock;
  let ownerAccessToken = '';
  let ownerBusinessId = '';
  let invoiceSeq = 0;
  let mongoContainer: StartedMongoDBContainer;
  let redisContainer: StartedTestContainer;

  beforeAll(async () => {
    [mongoContainer, redisContainer] = await Promise.all([
      new MongoDBContainer('mongo:7').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    const databaseUrl =
      mongoContainer.getConnectionString() +
      '/servixos_jobs_test?directConnection=true';
    const redisUrl = `redis://localhost:${redisContainer.getMappedPort(6379)}`;

    ({ app } = await createTestApp({ databaseUrl, redisUrl }));
    dbConnection = app.get<Connection>(getConnectionToken());

    const tokenRes = await request(app.getHttpServer() as Server).get(
      '/api/auth/client-token',
    );
    clientToken = (tokenRes.body as { data: { token: string } }).data.token;

    const mockAgenda = app.get<Record<string, jest.Mock>>(AgendaService);
    nowSpy = mockAgenda['now'];

    const categoryModel = getModelForClass(BusinessCategory, {
      existingConnection: dbConnection,
    });
    const category = await categoryModel.create({
      name: 'Repairs',
      slug: 'repairs',
      isActive: true,
    });

    const login = await fullOnboarding(OWNER, category._id.toString());
    ownerAccessToken = login.accessToken;
    ownerBusinessId = login.user.businessId;
  }, 300_000);

  afterAll(async () => {
    if (app) await app.close();
    if (mongoContainer) await mongoContainer.stop();
    if (redisContainer) await redisContainer.stop();
  });

  function req() {
    return request(app.getHttpServer() as Server);
  }

  function authed(r: request.Test): request.Test {
    return signRequest(r, clientToken);
  }

  function asOwner(r: request.Test): request.Test {
    return authed(
      r
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('x-business-id', ownerBusinessId),
    );
  }

  function captureOtpFor(email: string): string {
    const calls = nowSpy.mock.calls as [string, EmailJobArgs][];
    const match = [...calls]
      .reverse()
      .find((c) => c[0] === JOBS.EMAIL_VERIFICATION && c[1].to === email);
    if (!match?.[1].otp) throw new Error(`No OTP captured for ${email}`);
    return match[1].otp;
  }

  async function fullOnboarding(
    user: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      password: string;
      pin: string;
    },
    categoryId: string,
  ): Promise<LoginPayload> {
    await authed(
      req().post('/api/auth/onboarding/account').send({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        password: user.password,
        confirmPassword: user.password,
      }),
    );

    const otp = captureOtpFor(user.email);

    await authed(
      req()
        .post('/api/auth/onboarding/verify-email')
        .send({ email: user.email, otp }),
    );

    await authed(
      req()
        .post('/api/auth/onboarding/set-pin')
        .send({ email: user.email, pin: user.pin, confirmPin: user.pin }),
    );

    const res = await authed(
      req()
        .post('/api/auth/onboarding/business')
        .send({
          email: user.email,
          businessName: `${user.firstName} Repairs`,
          businessCategory: categoryId,
          businessDescription: 'Household repair and maintenance services.',
          timezone: 'America/New_York',
        }),
    );

    return (res.body as ApiBody<LoginPayload>).data!;
  }

  it('supports get all, get single, update, and delete job endpoints', async () => {
    const createClientRes = await asOwner(
      req()
        .post('/api/clients')
        .send({
          name: 'Client CRUD',
          email: `client-crud-${Date.now()}@test.local`,
          phone: '+12025550187',
        }),
    );
    expect(createClientRes.status).toBe(201);
    const clientId = (createClientRes.body as ApiBody<{ _id: string }>).data!
      ._id;

    const createJobRes = await asOwner(
      req()
        .post('/api/jobs')
        .send({
          clientId,
          title: 'Window Cleaning',
          description: 'Interior and exterior window service',
          scheduledDate: new Date(Date.now() + 86_400_000).toISOString(),
          location: '100 King Street',
          price: 220,
        }),
    );
    expect(createJobRes.status).toBe(201);
    const createdJob = (createJobRes.body as ApiBody<{ _id: string }>).data!;
    const jobId = createdJob._id;

    const getJobRes = await asOwner(req().get(`/api/jobs/${jobId}`));
    expect(getJobRes.status).toBe(200);
    expect((getJobRes.body as ApiBody<{ _id: string }>).data?._id).toBe(jobId);

    const listJobsRes = await asOwner(
      req().get('/api/jobs').query({
        search: 'window',
        page: 1,
        limit: 10,
      }),
    );
    expect(listJobsRes.status).toBe(200);
    const listBody = listJobsRes.body as ApiBody<Array<{ _id: string }>>;
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listBody.data?.some((job) => job._id === jobId)).toBe(true);
    expect(listBody.meta).toMatchObject({
      page: 1,
      limit: 10,
    });

    const updateRes = await asOwner(
      req().patch(`/api/jobs/${jobId}`).send({
        title: 'Window Cleaning - Updated',
        notes: 'Bring extension ladder',
      }),
    );
    expect(updateRes.status).toBe(200);
    expect(
      (updateRes.body as ApiBody<{ title: string; notes: string }>).data?.title,
    ).toBe('Window Cleaning - Updated');
    expect(
      (updateRes.body as ApiBody<{ title: string; notes: string }>).data?.notes,
    ).toBe('Bring extension ladder');

    const deleteRes = await asOwner(req().delete(`/api/jobs/${jobId}`));
    expect(deleteRes.status).toBe(200);
    expect((deleteRes.body as ApiBody).message).toBe(
      JOBS_MESSAGES.SUCCESS.DELETED,
    );

    const getDeletedRes = await asOwner(req().get(`/api/jobs/${jobId}`));
    expect(getDeletedRes.status).toBe(404);
    expect((getDeletedRes.body as ApiBody).message).toBe(
      JOBS_MESSAGES.ERROR.NOT_FOUND,
    );
  });

  it('enforces 50% deposit before starting a job', async () => {
    const createClientRes = await asOwner(
      req()
        .post('/api/clients')
        .send({
          name: 'Client A',
          email: `client-a-${Date.now()}@test.local`,
          phone: '+12025550188',
        }),
    );
    expect(createClientRes.status).toBe(201);
    const clientId = (createClientRes.body as ApiBody<{ _id: string }>).data!
      ._id;

    const createJobRes = await asOwner(
      req()
        .post('/api/jobs')
        .send({
          clientId,
          title: 'Generator Repair',
          description: 'Fix starter issue',
          scheduledDate: new Date(Date.now() + 86_400_000).toISOString(),
          location: '45 Maple Street',
          price: 200,
        }),
    );
    expect(createJobRes.status).toBe(201);
    const jobId = (createJobRes.body as ApiBody<{ _id: string }>).data!._id;

    const startWithoutDepositRes = await asOwner(
      req().patch(`/api/jobs/${jobId}/start`).send({}),
    );
    expect(startWithoutDepositRes.status).toBe(400);
    expect((startWithoutDepositRes.body as ApiBody).message).toBe(
      JOBS_MESSAGES.ERROR.DEPOSIT_REQUIRED_TO_START,
    );

    const invoiceNumber = `INV-${Date.now()}-${++invoiceSeq}`;
    const createInvoiceRes = await asOwner(
      req()
        .post('/api/invoices')
        .send({
          clientId,
          invoiceNumber,
          invoiceDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          lineItems: [
            {
              description: 'Generator repair service',
              quantity: 1,
              unitPrice: 200,
            },
          ],
          taxRate: 0,
          jobId,
        }),
    );
    expect(createInvoiceRes.status).toBe(201);
    const invoiceId = (createInvoiceRes.body as ApiBody<{ _id: string }>).data!
      ._id;

    const partialPaymentRes = await asOwner(
      req().post('/api/payments').send({
        invoiceId,
        clientId,
        paymentDate: new Date().toISOString(),
        paymentMode: PaymentMode.BANK_TRANSFER,
        amount: 90,
        status: PaymentStatus.PARTIAL,
        notes: 'Initial transfer',
      }),
    );
    expect(partialPaymentRes.status).toBe(201);

    const startAfterSmallDepositRes = await asOwner(
      req().patch(`/api/jobs/${jobId}/start`).send({}),
    );
    expect(startAfterSmallDepositRes.status).toBe(400);
    expect((startAfterSmallDepositRes.body as ApiBody).message).toBe(
      JOBS_MESSAGES.ERROR.DEPOSIT_REQUIRED_TO_START,
    );

    const topUpPaymentRes = await asOwner(
      req().post('/api/payments').send({
        invoiceId,
        clientId,
        paymentDate: new Date().toISOString(),
        paymentMode: PaymentMode.BANK_TRANSFER,
        amount: 10,
        status: PaymentStatus.COMPLETED,
        notes: 'Top-up transfer',
      }),
    );
    expect(topUpPaymentRes.status).toBe(201);

    const startAfterDepositRes = await asOwner(
      req().patch(`/api/jobs/${jobId}/start`).send({}),
    );
    expect(startAfterDepositRes.status).toBe(200);
    expect(
      (startAfterDepositRes.body as ApiBody<{ status: string }>).data?.status,
    ).toBe('in_progress');
  });

  it('supports completion and balance-invoice settlement flow', async () => {
    const createClientRes = await asOwner(
      req()
        .post('/api/clients')
        .send({
          name: 'Client B',
          email: `client-b-${Date.now()}@test.local`,
          phone: '+12025550189',
        }),
    );
    expect(createClientRes.status).toBe(201);
    const clientId = (createClientRes.body as ApiBody<{ _id: string }>).data!
      ._id;

    const createJobRes = await asOwner(
      req()
        .post('/api/jobs')
        .send({
          clientId,
          title: 'Air Conditioner Servicing',
          description: 'Full maintenance and filter replacement',
          scheduledDate: new Date(Date.now() + 172_800_000).toISOString(),
          location: '22 Pine Avenue',
          price: 300,
        }),
    );
    expect(createJobRes.status).toBe(201);
    const jobId = (createJobRes.body as ApiBody<{ _id: string }>).data!._id;

    const depositInvoiceNumber = `INV-${Date.now()}-${++invoiceSeq}`;
    const createDepositInvoiceRes = await asOwner(
      req()
        .post('/api/invoices')
        .send({
          clientId,
          invoiceNumber: depositInvoiceNumber,
          invoiceDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
          lineItems: [
            {
              description: '50% upfront deposit',
              quantity: 1,
              unitPrice: 150,
            },
          ],
          taxRate: 0,
          jobId,
        }),
    );
    expect(createDepositInvoiceRes.status).toBe(201);
    const depositInvoiceId = (
      createDepositInvoiceRes.body as ApiBody<{ _id: string }>
    ).data!._id;

    const payDepositRes = await asOwner(
      req().post('/api/payments').send({
        invoiceId: depositInvoiceId,
        clientId,
        paymentDate: new Date().toISOString(),
        paymentMode: PaymentMode.BANK_TRANSFER,
        amount: 150,
        status: PaymentStatus.COMPLETED,
        notes: 'Deposit paid in full',
      }),
    );
    expect(payDepositRes.status).toBe(201);

    const startJobRes = await asOwner(
      req().patch(`/api/jobs/${jobId}/start`).send({}),
    );
    expect(startJobRes.status).toBe(200);
    expect((startJobRes.body as ApiBody<{ status: string }>).data?.status).toBe(
      'in_progress',
    );

    const completeJobRes = await asOwner(
      req().patch(`/api/jobs/${jobId}/complete`).send({}),
    );
    expect(completeJobRes.status).toBe(200);
    expect(
      (completeJobRes.body as ApiBody<{ status: string }>).data?.status,
    ).toBe('completed');

    const balanceInvoiceNumber = `INV-${Date.now()}-${++invoiceSeq}`;
    const createBalanceInvoiceRes = await asOwner(
      req()
        .post('/api/invoices')
        .send({
          clientId,
          invoiceNumber: balanceInvoiceNumber,
          invoiceDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString(),
          lineItems: [
            {
              description: '50% balance after completion',
              quantity: 1,
              unitPrice: 150,
            },
          ],
          taxRate: 0,
          jobId,
        }),
    );
    expect(createBalanceInvoiceRes.status).toBe(201);
    const balanceInvoiceId = (
      createBalanceInvoiceRes.body as ApiBody<{ _id: string }>
    ).data!._id;

    const sendBalanceInvoiceRes = await asOwner(
      req().post(`/api/invoices/${balanceInvoiceId}/send`).send({}),
    );
    expect(sendBalanceInvoiceRes.status).toBe(200);
    expect(
      (sendBalanceInvoiceRes.body as ApiBody<{ queued: boolean }>).data?.queued,
    ).toBe(true);

    const payBalanceRes = await asOwner(
      req().post('/api/payments').send({
        invoiceId: balanceInvoiceId,
        clientId,
        paymentDate: new Date().toISOString(),
        paymentMode: PaymentMode.BANK_TRANSFER,
        amount: 150,
        status: PaymentStatus.COMPLETED,
        notes: 'Final balance settled',
      }),
    );
    expect(payBalanceRes.status).toBe(201);

    const getBalanceInvoiceRes = await asOwner(
      req().get(`/api/invoices/${balanceInvoiceId}`),
    );
    expect(getBalanceInvoiceRes.status).toBe(200);
    expect(
      (getBalanceInvoiceRes.body as ApiBody<{ status: string }>).data?.status,
    ).toBe('paid');
    expect(
      (getBalanceInvoiceRes.body as ApiBody<{ amountPaid: number }>).data
        ?.amountPaid,
    ).toBe(150);
  });

  it('returns 404 for update and delete when job does not exist', async () => {
    const missingJobId = new Types.ObjectId().toString();

    const updateRes = await asOwner(
      req().patch(`/api/jobs/${missingJobId}`).send({
        title: 'Non-existent job update',
      }),
    );
    expect(updateRes.status).toBe(404);
    expect((updateRes.body as ApiBody).message).toBe(
      JOBS_MESSAGES.ERROR.NOT_FOUND,
    );

    const deleteRes = await asOwner(req().delete(`/api/jobs/${missingJobId}`));
    expect(deleteRes.status).toBe(404);
    expect((deleteRes.body as ApiBody).message).toBe(
      JOBS_MESSAGES.ERROR.NOT_FOUND,
    );
  });
});
