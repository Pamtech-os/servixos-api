import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import {
  MongoDBContainer,
  StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Connection } from 'mongoose';
import { Server } from 'http';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app';
import { signRequest } from '../helpers/sign-request';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { StripeService } from 'src/modules/stripe/services/stripe.service';
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';
import { Business } from 'src/modules/business/schemas/business.schema';
import { User } from 'src/modules/users/schemas/user.schema';
import { JOBS } from 'src/common/constants/agenda.constants';
import { BILLING_TERMS_VERSION } from 'src/common/constants/billing.constants';

interface ApiBody<T = unknown> {
  success: boolean;
  code?: string;
  data?: T;
}

interface Login {
  accessToken: string;
  user: { businessId: string };
}

let emailSeq = 0;
const nextEmail = () => `gate${++emailSeq}@test.local`;

describe('Payment method gate (integration, REQUIRE_PAYMENT_METHOD=true)', () => {
  let app: INestApplication;
  let clientToken: string;
  let nowSpy: jest.Mock;
  let categoryId: string;
  let businessModel: ReturnModelType<typeof Business>;
  let userModel: ReturnModelType<typeof User>;
  let stripe: StripeService;
  let mongoContainer: StartedMongoDBContainer;
  let redisContainer: StartedTestContainer;

  beforeAll(async () => {
    [mongoContainer, redisContainer] = await Promise.all([
      new MongoDBContainer('mongo:7').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);
    ({ app } = await createTestApp({
      databaseUrl:
        mongoContainer.getConnectionString() +
        '/servixos_test?directConnection=true',
      redisUrl: `redis://localhost:${redisContainer.getMappedPort(6379)}`,
      requirePaymentMethod: true,
    }));

    const tokenRes = await request(app.getHttpServer() as Server).get(
      '/api/auth/client-token',
    );
    clientToken = (tokenRes.body as { data: { token: string } }).data.token;

    const connection = app.get<Connection>(getConnectionToken());
    businessModel = getModelForClass(Business, {
      existingConnection: connection,
    });
    userModel = getModelForClass(User, { existingConnection: connection });
    const category = await getModelForClass(BusinessCategory, {
      existingConnection: connection,
    }).create({ name: 'Cleaning', slug: 'cleaning', isActive: true });
    categoryId = String(category._id);
    nowSpy = app.get<Record<string, jest.Mock>>(AgendaService)['now'];

    stripe = app.get(StripeService);
    // Unique ids: businesses.stripeCustomerId has a unique index
    let customerSeq = 0;
    jest
      .spyOn(stripe, 'createCustomer')
      .mockImplementation(() =>
        Promise.resolve({ id: `cus_gate_${++customerSeq}` } as Awaited<
          ReturnType<StripeService['createCustomer']>
        >),
      );
    jest.spyOn(stripe, 'attachPaymentMethod').mockResolvedValue(undefined);
    jest
      .spyOn(stripe, 'getPriceInCurrency')
      .mockResolvedValue({ amount: 2400, currency: 'gbp', interval: 'month' });
    jest.spyOn(stripe, 'createSubscription').mockResolvedValue({
      id: 'sub_gate',
      trial_end: Math.floor(Date.now() / 1000) + 7 * 86_400,
    } as Awaited<ReturnType<StripeService['createSubscription']>>);
  }, 300_000);

  afterAll(async () => {
    await app.close();
    await mongoContainer.stop();
    await redisContainer.stop();
  });

  function req() {
    return request(app.getHttpServer() as Server);
  }

  function as(r: request.Test, token: string, businessId?: string) {
    const withAuth = r.set('Authorization', `Bearer ${token}`);
    return signRequest(
      businessId ? withAuth.set('x-business-id', businessId) : withAuth,
      clientToken,
    );
  }

  /** Runs Phase 1 + business creation and returns the full owner session. */
  async function ownerWithBusiness(email = nextEmail()): Promise<Login> {
    await signRequest(
      req().post('/api/auth/onboarding/account').send({
        firstName: 'Gate',
        lastName: 'Keeper',
        email,
        phone: '+447400123456',
        country: 'GB',
        password: 'Password123',
        confirmPassword: 'Password123',
      }),
      clientToken,
    );
    const calls = nowSpy.mock.calls as [string, { to: string; otp?: string }][];
    const otp = [...calls]
      .reverse()
      .find((c) => c[0] === JOBS.EMAIL_VERIFICATION && c[1].to === email)![1]
      .otp;
    const verify = await signRequest(
      req().post('/api/auth/onboarding/verify-email').send({ email, otp }),
      clientToken,
    );
    const token = (verify.body as ApiBody<Login>).data!.accessToken;
    await as(
      req()
        .post('/api/auth/onboarding/set-pin')
        .send({ pin: '1234', confirmPin: '1234' }),
      token,
    );
    const res = await as(
      req().post('/api/auth/onboarding/business').send({
        businessName: 'Gate Cleaners',
        businessCategory: categoryId,
        businessDescription: 'Residential cleaning services in London.',
        timezone: 'Europe/London',
      }),
      token,
    );
    return (res.body as ApiBody<Login>).data!;
  }

  async function startTrial(owner: Login): Promise<void> {
    const res = await as(
      req().post('/api/subscription/subscribe').send({
        plan: 'starter',
        billingInterval: 'monthly',
        paymentMethodId: 'pm_card_visa',
        acceptTerms: true,
        termsVersion: BILLING_TERMS_VERSION,
      }),
      owner.accessToken,
      owner.user.businessId,
    );
    expect(res.status).toBe(200);
  }

  it('creates new businesses as incomplete with no trial running', async () => {
    // Arrange
    const owner = await ownerWithBusiness();

    // Act
    const business = await businessModel.findById(owner.user.businessId).lean();

    // Assert
    expect(business?.subscription).toMatchObject({
      status: 'incomplete',
      hasPaymentMethod: false,
    });
  });

  it('blocks app routes until a payment method is added', async () => {
    // Arrange
    const owner = await ownerWithBusiness();

    // Act
    const res = await as(
      req().get('/api/clients'),
      owner.accessToken,
      owner.user.businessId,
    );

    // Assert
    expect(res.body).toMatchObject({
      statusCode: 403,
      code: 'PAYMENT_METHOD_REQUIRED',
    });
  });

  it('still serves the dashboard profile so the payment step can render', async () => {
    // Arrange
    const owner = await ownerWithBusiness();

    // Act
    const res = await as(
      req().get('/api/me'),
      owner.accessToken,
      owner.user.businessId,
    );

    // Assert
    expect((res.body as ApiBody<{ subscription: unknown }>).data).toMatchObject(
      { subscription: { status: 'incomplete' } },
    );
  });

  it('returns a trial quote in the local currency with the terms version', async () => {
    // Arrange
    const owner = await ownerWithBusiness();

    // Act
    const res = await as(
      req()
        .get('/api/subscription/trial-quote')
        .query({ plan: 'starter', billingInterval: 'monthly' }),
      owner.accessToken,
      owner.user.businessId,
    );

    // Assert
    expect((res.body as ApiBody).data).toMatchObject({
      currency: 'GBP',
      formattedAmount: '£24.00',
      trialDays: 7,
      taxMode: 'none',
      termsVersion: BILLING_TERMS_VERSION,
    });
  });

  it('rejects subscribing without a payment method', async () => {
    // Arrange
    const owner = await ownerWithBusiness();

    // Act
    const res = await as(
      req().post('/api/subscription/subscribe').send({
        plan: 'starter',
        billingInterval: 'monthly',
        acceptTerms: true,
        termsVersion: BILLING_TERMS_VERSION,
      }),
      owner.accessToken,
      owner.user.businessId,
    );

    // Assert
    expect(res.status).toBe(400);
  });

  it('rejects subscribing without accepting the terms', async () => {
    // Arrange
    const owner = await ownerWithBusiness();

    // Act
    const res = await as(
      req().post('/api/subscription/subscribe').send({
        plan: 'starter',
        billingInterval: 'monthly',
        paymentMethodId: 'pm_card_visa',
        acceptTerms: false,
        termsVersion: BILLING_TERMS_VERSION,
      }),
      owner.accessToken,
      owner.user.businessId,
    );

    // Assert
    expect(res.status).toBe(400);
  });

  it('unlocks the app once the trial starts with a card', async () => {
    // Arrange
    const owner = await ownerWithBusiness();
    await startTrial(owner);

    // Act
    const res = await as(
      req().get('/api/clients'),
      owner.accessToken,
      owner.user.businessId,
    );

    // Assert
    expect(res.status).toBe(200);
  });

  it('records consent and marks onboarding complete', async () => {
    // Arrange
    const owner = await ownerWithBusiness();

    // Act
    await startTrial(owner);
    const business = await businessModel.findById(owner.user.businessId).lean();
    const user = await userModel.findOne({ businessId: business!._id }).lean();

    // Assert
    expect({
      status: business?.subscription.status,
      consent: business?.billingConsent?.termsVersion,
      stage: user?.onboardingStage,
    }).toEqual({
      status: 'trialing',
      consent: BILLING_TERMS_VERSION,
      stage: 'complete',
    });
  });
});
