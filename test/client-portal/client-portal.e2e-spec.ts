import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
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
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { JOBS } from 'src/common/constants/agenda.constants';
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';
import { Job, JobStatus } from 'src/modules/jobs/schemas/job.schema';
import {
  Invoice,
  InvoiceStatus,
} from 'src/modules/invoices/schemas/invoice.schema';
import {
  Payment,
  PaymentMode,
  PaymentStatus,
} from 'src/modules/payments/schemas/payment.schema';
import {
  Contract,
  ContractStatus,
} from 'src/modules/contracts/schemas/contract.schema';
import { Conversation } from 'src/modules/messaging/schemas/conversation.schema';
import {
  Message,
  MessageSender,
  MessageStatus,
} from 'src/modules/messaging/schemas/message.schema';

interface ApiBody<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface OwnerLogin {
  accessToken: string;
  user: {
    businessId: string;
  };
}

interface ClientAuthLogin {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    clientId: string;
    email: string;
    mustChangePassword: boolean;
  };
}

interface EmailJobData {
  to: string;
  otp?: string;
  temporaryPassword?: string;
}

const OWNER = {
  firstName: 'Portal',
  lastName: 'Owner',
  email: 'client-portal-owner@test.local',
  phone: '+12025550177',
  password: 'Password123',
  pin: '1122',
};

describe('Client Portal (integration)', () => {
  let app: INestApplication;
  let clientToken: string;
  let nowSpy: jest.Mock;
  let connection: Connection;

  let categoryId = '';
  let ownerAccessToken = '';
  let ownerBusinessId = '';
  let clientAccessToken = '';
  let clientBusinessId = '';
  let clientId = '';
  let clientTemporaryPassword = '';

  let mongoContainer: StartedMongoDBContainer;
  let redisContainer: StartedTestContainer;

  let jobsModel: ReturnModelType<typeof Job>;
  let invoicesModel: ReturnModelType<typeof Invoice>;
  let paymentsModel: ReturnModelType<typeof Payment>;
  let contractsModel: ReturnModelType<typeof Contract>;
  let conversationsModel: ReturnModelType<typeof Conversation>;
  let messagesModel: ReturnModelType<typeof Message>;

  beforeAll(async () => {
    [mongoContainer, redisContainer] = await Promise.all([
      new MongoDBContainer('mongo:7').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    const databaseUrl =
      mongoContainer.getConnectionString() +
      '/servixos_client_portal_test?directConnection=true';
    const redisUrl = `redis://localhost:${redisContainer.getMappedPort(6379)}`;

    ({ app } = await createTestApp({ databaseUrl, redisUrl }));

    connection = app.get<Connection>(getConnectionToken());

    jobsModel = getModelForClass(Job, { existingConnection: connection });
    invoicesModel = getModelForClass(Invoice, {
      existingConnection: connection,
    });
    paymentsModel = getModelForClass(Payment, {
      existingConnection: connection,
    });
    contractsModel = getModelForClass(Contract, {
      existingConnection: connection,
    });
    conversationsModel = getModelForClass(Conversation, {
      existingConnection: connection,
    });
    messagesModel = getModelForClass(Message, {
      existingConnection: connection,
    });

    const tokenRes = await request(app.getHttpServer() as Server).get(
      '/api/auth/client-token',
    );
    clientToken = (tokenRes.body as { data: { token: string } }).data.token;

    const mockAgenda = app.get<Record<string, jest.Mock>>(AgendaService);
    nowSpy = mockAgenda['now'];

    const categoryModel = getModelForClass(BusinessCategory, {
      existingConnection: connection,
    });
    const category = await categoryModel.create({
      name: 'Client Portal',
      slug: 'client-portal',
      isActive: true,
    });
    categoryId = category._id.toString();

    const ownerLogin = await fullOnboarding(OWNER, categoryId);
    ownerAccessToken = ownerLogin.accessToken;
    ownerBusinessId = ownerLogin.user.businessId;

    const createdClient = await createClientForPortal();
    clientId = createdClient.clientId;
    clientTemporaryPassword = createdClient.temporaryPassword;

    const clientLogin = await loginClient(
      createdClient.email,
      createdClient.temporaryPassword,
    );
    clientAccessToken = clientLogin.accessToken;
    clientBusinessId = ownerBusinessId;

    await seedClientPortalData();
  }, 300_000);

  afterAll(async () => {
    if (app) await app.close();
    if (mongoContainer) await mongoContainer.stop();
    if (redisContainer) await redisContainer.stop();
  });

  function req() {
    return request(app.getHttpServer() as Server);
  }

  function signed(r: request.Test): request.Test {
    return signRequest(r, clientToken);
  }

  function asOwner(r: request.Test): request.Test {
    return signed(
      r
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('x-business-id', ownerBusinessId),
    );
  }

  function asClient(r: request.Test): request.Test {
    return signed(r.set('Authorization', `Bearer ${clientAccessToken}`));
  }

  function captureOtpFor(email: string): string {
    const calls = nowSpy.mock.calls as [string, EmailJobData][];
    const match = [...calls]
      .reverse()
      .find((c) => c[0] === JOBS.EMAIL_VERIFICATION && c[1].to === email);

    if (!match?.[1].otp) throw new Error(`No OTP for ${email}`);
    return match[1].otp;
  }

  function captureTemporaryPassword(email: string): string {
    const calls = nowSpy.mock.calls as [string, EmailJobData][];
    const match = [...calls]
      .reverse()
      .find((c) => c[0] === JOBS.EMAIL_CLIENT_CREDENTIALS && c[1].to === email);

    if (!match?.[1].temporaryPassword) {
      throw new Error(`No temporary password for ${email}`);
    }

    return match[1].temporaryPassword;
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
    businessCategory: string,
  ): Promise<OwnerLogin> {
    await signed(
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
    await signed(
      req()
        .post('/api/auth/onboarding/verify-email')
        .send({ email: user.email, otp }),
    );

    await signed(
      req()
        .post('/api/auth/onboarding/set-pin')
        .send({ email: user.email, pin: user.pin, confirmPin: user.pin }),
    );

    const businessRes = await signed(
      req().post('/api/auth/onboarding/business').send({
        email: user.email,
        businessName: 'Client Portal Business',
        businessCategory,
        businessDescription: 'Client portal integration test business',
        timezone: 'America/New_York',
      }),
    );

    return (businessRes.body as ApiBody<OwnerLogin>).data!;
  }

  async function createClientForPortal(): Promise<{
    clientId: string;
    userId: string;
    email: string;
    temporaryPassword: string;
  }> {
    const email = `portal-client-${Date.now()}@test.local`;
    const createClientRes = await asOwner(
      req().post('/api/clients').send({
        name: 'Portal Client',
        email,
        phone: '+12025550190',
      }),
    );

    expect(createClientRes.status).toBe(201);

    const data = createClientRes.body as ApiBody<{
      _id: string;
      userId: string;
      email: string;
    }>;
    return {
      clientId: data.data!._id,
      userId: data.data!.userId,
      email,
      temporaryPassword: captureTemporaryPassword(email),
    };
  }

  async function loginClient(
    email: string,
    password: string,
  ): Promise<ClientAuthLogin> {
    const loginRes = await signed(
      req().post('/api/client-auth/login').send({ email, password }),
    );
    expect(loginRes.status).toBe(200);
    return (loginRes.body as ApiBody<ClientAuthLogin>).data!;
  }

  async function seedClientPortalData(): Promise<void> {
    const businessObjectId = new Types.ObjectId(clientBusinessId);
    const clientObjectId = new Types.ObjectId(clientId);

    const job = await jobsModel.create({
      businessId: businessObjectId,
      clientId: clientObjectId,
      title: 'Website Revamp',
      status: JobStatus.IN_PROGRESS,
      scheduledDate: new Date('2026-05-10T10:00:00.000Z'),
      timezone: 'America/New_York',
      price: 5000,
    });

    const invoice = await invoicesModel.create({
      businessId: businessObjectId,
      clientId: clientObjectId,
      invoiceNumber: 'INV-CP-001',
      status: InvoiceStatus.PARTIAL,
      invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
      dueDate: new Date('2026-05-20T00:00:00.000Z'),
      lineItems: [{ description: 'Design Work', quantity: 1, unitPrice: 5000 }],
      taxRate: 0,
      totalAmount: 5000,
      amountPaid: 2500,
      jobId: job._id,
      pdfUrl: 'https://example.com/invoice.pdf',
      timezone: 'America/New_York',
    });

    await paymentsModel.create({
      businessId: businessObjectId,
      invoiceId: invoice._id,
      clientId: clientObjectId,
      paymentDate: new Date('2026-05-02T00:00:00.000Z'),
      paymentMode: PaymentMode.BANK_TRANSFER,
      amount: 2500,
      status: PaymentStatus.PARTIAL,
      notes: 'Deposit',
      timezone: 'America/New_York',
    });

    await contractsModel.create({
      businessId: businessObjectId,
      clientId: clientObjectId,
      jobId: job._id,
      title: 'Website Revamp Contract',
      html: '<p>Contract body</p>',
      pdfUrl: 'https://example.com/contract.pdf',
      status: ContractStatus.SENT,
      sentAt: new Date('2026-05-03T00:00:00.000Z'),
      timezone: 'America/New_York',
    });

    const conversation = await conversationsModel.create({
      businessId: businessObjectId,
      clientId: clientObjectId,
      lastMessageContent: 'Welcome to the project',
      lastMessageAt: new Date('2026-05-04T00:00:00.000Z'),
      lastMessageSender: MessageSender.BUSINESS,
      clientUnreadCount: 1,
      businessUnreadCount: 0,
      isActive: false,
    });

    await messagesModel.create({
      businessId: businessObjectId,
      clientId: clientObjectId,
      conversationId: conversation._id,
      sender: MessageSender.BUSINESS,
      senderName: 'Client Portal Business',
      content: 'Welcome to the project',
      status: MessageStatus.SENT,
      attachmentUrl: 'https://example.com/brief.pdf',
      fileName: 'brief.pdf',
      mimeType: 'application/pdf',
      fileSize: 1200,
    });
  }

  it('returns dashboard, invoice, contract, files, contacts and activities data', async () => {
    const dashboardRes = await asClient(req().get('/api/client/api/dashboard'));
    expect(dashboardRes.status).toBe(200);
    const dashboardBody = dashboardRes.body as ApiBody<{
      outstandingBalance: number;
      totalPaid: number;
      pendingContractsCount: number;
      recentActivities: unknown[];
    }>;
    expect(dashboardBody.data?.outstandingBalance).toBeGreaterThan(0);
    expect(dashboardBody.data?.pendingContractsCount).toBeGreaterThanOrEqual(1);
    expect(dashboardBody.data?.recentActivities).toHaveLength(5);

    const invoicesRes = await asClient(
      req().get('/api/client/api/invoices').query({ page: 1, limit: 10 }),
    );
    expect(invoicesRes.status).toBe(200);
    const invoicesBody = invoicesRes.body as ApiBody<Array<{ id: string }>>;
    expect(Array.isArray(invoicesBody.data)).toBe(true);
    expect(invoicesBody.data?.length).toBeGreaterThan(0);

    const invoiceId = invoicesBody.data?.[0]?.id;
    expect(invoiceId).toBeDefined();

    const singleInvoiceRes = await asClient(
      req().get(`/api/client/api/invoices/${invoiceId as string}`),
    );
    expect(singleInvoiceRes.status).toBe(200);

    const contractsRes = await asClient(req().get('/api/client/api/contracts'));
    expect(contractsRes.status).toBe(200);
    const contractsBody = contractsRes.body as ApiBody<Array<{ id: string }>>;
    const contractId = contractsBody.data?.[0]?.id;
    expect(contractId).toBeDefined();

    const singleContractRes = await asClient(
      req().get(`/api/client/api/contracts/${contractId as string}`),
    );
    expect(singleContractRes.status).toBe(200);

    const signContractRes = await asClient(
      req()
        .patch(`/api/client/api/contracts/${contractId as string}/sign`)
        .send({
          signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
        }),
    );
    expect(signContractRes.status).toBe(200);

    const filesRes = await asClient(req().get('/api/client/api/files'));
    expect(filesRes.status).toBe(200);
    const filesBody = filesRes.body as ApiBody<Array<{ id: string }>>;
    expect(filesBody.data?.length).toBeGreaterThan(0);

    const fileId = filesBody.data?.[0]?.id;
    const fileDownloadRes = await asClient(
      req().get(`/api/client/api/files/${fileId as string}/download`),
    );
    expect(fileDownloadRes.status).toBe(200);

    const contactsRes = await asClient(req().get('/api/client/api/contacts'));
    expect(contactsRes.status).toBe(200);
    const contactsBody = contactsRes.body as ApiBody<
      Array<{
        businessEmail?: string;
        businessPhone?: string;
      }>
    >;
    expect(contactsBody.data?.[0]?.businessEmail).toBeTruthy();
    expect(contactsBody.data?.[0]?.businessPhone).toBeTruthy();

    const activitiesRes = await asClient(
      req().get('/api/client/api/activities'),
    );
    expect(activitiesRes.status).toBe(200);
    const activitiesBody = activitiesRes.body as ApiBody<unknown[]>;
    expect(Array.isArray(activitiesBody.data)).toBe(true);
  });

  it('supports client messages read flow and profile update/change-password', async () => {
    const conversationsRes = await asClient(
      req().get('/api/client/api/messages/conversations'),
    );
    expect(conversationsRes.status).toBe(200);

    const conversationBody = conversationsRes.body as ApiBody<
      Array<{ serviceProvider: { id: string } }>
    >;
    const providerId = conversationBody.data?.[0]?.serviceProvider.id;
    expect(providerId).toBeDefined();

    const listMessagesRes = await asClient(
      req()
        .get(`/api/client/api/messages/conversations/${providerId as string}`)
        .query({ page: 1, limit: 20 }),
    );
    expect(listMessagesRes.status).toBe(200);

    const markReadRes = await asClient(
      req().patch(
        `/api/client/api/messages/conversations/${providerId as string}/read`,
      ),
    );
    expect(markReadRes.status).toBe(200);

    const profileRes = await asClient(req().get('/api/client/api/profile'));
    expect(profileRes.status).toBe(200);

    const updateProfileRes = await asClient(
      req().patch('/api/client/api/profile').send({ firstName: 'Updated' }),
    );
    expect(updateProfileRes.status).toBe(200);

    const changePasswordRes = await asClient(
      req().patch('/api/client/api/profile/change-password').send({
        currentPassword: 'WrongPassword123',
        newPassword: 'NewPassword123',
        confirmPassword: 'NewPassword123',
      }),
    );

    // Wrong current password should be rejected securely.
    expect(changePasswordRes.status).toBe(400);

    const changePasswordSuccessRes = await asClient(
      req().patch('/api/client/api/profile/change-password').send({
        currentPassword: clientTemporaryPassword,
        newPassword: 'NewPassword123',
        confirmPassword: 'NewPassword123',
      }),
    );
    expect(changePasswordSuccessRes.status).toBe(200);

    const meRes = await asClient(req().get('/api/client-auth/me'));
    expect(meRes.status).toBe(200);
    const meBody = meRes.body as ApiBody<ClientAuthLogin['user']>;
    expect(meBody.data?.mustChangePassword).toBe(false);
  });
});
