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
import { StripeWebhookService } from 'src/modules/stripe/webhooks/stripe-webhook.service';
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';
import { Business } from 'src/modules/business/schemas/business.schema';
import { JOBS } from 'src/common/constants/agenda.constants';
import { BILLING_TERMS_VERSION } from 'src/common/constants/billing.constants';

/**
 * Stage 5 (app side): replays the webhook payloads Stripe sends during the
 * trial lifecycle — shapes captured from the test-clock run — through the
 * real webhook service and job handlers, then checks subscription status and
 * access through the real guards.
 */

interface ApiBody<T = unknown> {
  code?: string;
  data?: T;
}

interface Login {
  accessToken: string;
  user: { businessId: string };
}

type JobHandler = (job: { attrs: { data: unknown } }) => Promise<void>;

/** Jobs executed in-process; everything else (emails) is only recorded. */
const ROUTED_JOBS = new Set<string>([
  JOBS.SUBSCRIPTION_PAYMENT_SUCCEEDED,
  JOBS.SUBSCRIPTION_PAYMENT_FAILED,
  JOBS.SUBSCRIPTION_CANCELED,
  JOBS.SUBSCRIPTION_TRIAL_ENDING,
]);

const PRICE_ID = 'price_trial_lifecycle';
const DAY = 86_400;

let seq = 0;
const next = (prefix: string) => `${prefix}_${++seq}`;

describe('Trial lifecycle: status and access (integration)', () => {
  let app: INestApplication;
  let clientToken: string;
  let nowSpy: jest.Mock;
  let scheduleSpy: jest.Mock;
  let categoryId: string;
  let businessModel: ReturnModelType<typeof Business>;
  let webhooks: StripeWebhookService;
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
    const category = await getModelForClass(BusinessCategory, {
      existingConnection: connection,
    }).create({ name: 'Cleaning', slug: 'cleaning', isActive: true });
    categoryId = String(category._id);

    // In-process Agenda: run the subscription job handlers the app registered
    const agenda = app.get<Record<string, jest.Mock>>(AgendaService);
    nowSpy = agenda['now'];
    scheduleSpy = agenda['schedule'];
    const handlers = new Map(
      (agenda['define'].mock.calls as [string, JobHandler][]).map(
        ([name, handler]) => [name, handler],
      ),
    );
    nowSpy.mockImplementation((name: string, data: unknown) => {
      const handler = ROUTED_JOBS.has(name) ? handlers.get(name) : undefined;
      return handler ? handler({ attrs: { data } }) : Promise.resolve();
    });

    webhooks = app.get(StripeWebhookService);
    const stripe = app.get(StripeService);
    jest
      .spyOn(stripe, 'createCustomer')
      .mockImplementation(() =>
        Promise.resolve({ id: next('cus') } as Awaited<
          ReturnType<StripeService['createCustomer']>
        >),
      );
    jest.spyOn(stripe, 'attachPaymentMethod').mockResolvedValue(undefined);
    jest
      .spyOn(stripe, 'getPriceInCurrency')
      .mockResolvedValue({ amount: 2900, currency: 'usd', interval: 'month' });
    jest.spyOn(stripe, 'createSubscription').mockImplementation(() =>
      Promise.resolve({
        id: next('sub'),
        trial_end: Math.floor(Date.now() / 1000) + 7 * DAY,
      } as Awaited<ReturnType<StripeService['createSubscription']>>),
    );
    jest
      .spyOn(stripe, 'getInvoicePaymentClientSecret')
      .mockResolvedValue({ clientSecret: 'pi_123_secret_abc', invoiceId: 'x' });
  }, 300_000);

  afterAll(async () => {
    await app.close();
    await mongoContainer.stop();
    await redisContainer.stop();
  });

  function req() {
    return request(app.getHttpServer() as Server);
  }

  function as(r: request.Test, owner: Login) {
    return signRequest(
      r
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .set('x-business-id', owner.user.businessId),
      clientToken,
    );
  }

  /** Signup → business → card + consent: returns a trialing owner and their Stripe ids. */
  async function trialingOwner() {
    const email = `${next('life')}@test.local`;
    await signRequest(
      req().post('/api/auth/onboarding/account').send({
        firstName: 'Tara',
        lastName: 'Lee',
        email,
        phone: '+14165550123',
        country: 'CA',
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
    const bearer = (r: request.Test) =>
      signRequest(r.set('Authorization', `Bearer ${token}`), clientToken);
    await bearer(
      req()
        .post('/api/auth/onboarding/set-pin')
        .send({ pin: '1234', confirmPin: '1234' }),
    );
    const created = await bearer(
      req().post('/api/auth/onboarding/business').send({
        businessName: 'Lifecycle Cleaners',
        businessCategory: categoryId,
        businessDescription: 'Residential cleaning services in Toronto.',
        timezone: 'America/Toronto',
      }),
    );
    const owner = (created.body as ApiBody<Login>).data!;
    await as(
      req().post('/api/subscription/subscribe').send({
        plan: 'starter',
        billingInterval: 'monthly',
        paymentMethodId: 'pm_card_visa',
        acceptTerms: true,
        termsVersion: BILLING_TERMS_VERSION,
      }),
      owner,
    );
    const business = await businessModel.findById(owner.user.businessId).lean();
    return {
      owner,
      customerId: business!.stripeCustomerId!,
      subscriptionId: business!.stripeSubscriptionId!,
      trialEnd: Math.floor(
        business!.subscription.trialEndsAt!.getTime() / 1000,
      ),
    };
  }

  /** Invoice payload in the current (2025+) API shape, as captured from Stripe. */
  function invoice(
    customerId: string,
    subscriptionId: string,
    amount: number,
    periodEnd: number,
  ) {
    return {
      id: next('in'),
      customer: customerId,
      amount_paid: amount,
      amount_due: amount,
      currency: 'usd',
      period_end: periodEnd - 30 * DAY,
      parent: { subscription_details: { subscription: subscriptionId } },
      lines: {
        data: [
          {
            period: { end: periodEnd },
            pricing: { price_details: { price: PRICE_ID } },
          },
        ],
      },
    };
  }

  const send = (type: string, object: Record<string, unknown>) =>
    webhooks.handle({ id: next('evt'), type, data: { object } });

  const statusOf = async (businessId: string) =>
    (await businessModel.findById(businessId).lean())!.subscription;

  it('keeps the business trialing on the $0 trial-start invoice', async () => {
    // Arrange
    const { owner, customerId, subscriptionId, trialEnd } =
      await trialingOwner();

    // Act
    await send(
      'invoice.payment_succeeded',
      invoice(customerId, subscriptionId, 0, trialEnd),
    );

    // Assert
    expect((await statusOf(owner.user.businessId)).status).toBe('trialing');
  });

  it('schedules the 3-day and 1-day reminders before the trial ends', async () => {
    // Arrange
    const { customerId, subscriptionId, trialEnd } = await trialingOwner();
    nowSpy.mockClear();
    scheduleSpy.mockClear();

    // Act
    await send('customer.subscription.trial_will_end', {
      id: subscriptionId,
      customer: customerId,
      trial_end: trialEnd,
    });

    // Assert
    expect({
      threeDay: nowSpy.mock.calls.some(([n]) => n === JOBS.EMAIL_TRIAL_ENDING),
      oneDay: scheduleSpy.mock.calls.some(
        ([, n]) => n === JOBS.EMAIL_TRIAL_ENDING,
      ),
    }).toEqual({ threeDay: true, oneDay: true });
  });

  it('activates the subscription when the first charge succeeds', async () => {
    // Arrange
    const { owner, customerId, subscriptionId, trialEnd } =
      await trialingOwner();
    const periodEnd = trialEnd + 30 * DAY;

    // Act
    await send(
      'invoice.payment_succeeded',
      invoice(customerId, subscriptionId, 2900, periodEnd),
    );
    const business = await businessModel.findById(owner.user.businessId).lean();

    // Assert
    expect({
      status: business?.subscription.status,
      currentPeriodEnd: business?.subscription.currentPeriodEnd?.getTime(),
      stripeSubscriptionId: business?.stripeSubscriptionId,
    }).toEqual({
      status: 'active',
      currentPeriodEnd: periodEnd * 1000,
      stripeSubscriptionId: subscriptionId,
    });
  });

  it('keeps access after the first charge succeeds', async () => {
    // Arrange
    const { owner, customerId, subscriptionId, trialEnd } =
      await trialingOwner();
    await send(
      'invoice.payment_succeeded',
      invoice(customerId, subscriptionId, 2900, trialEnd + 30 * DAY),
    );

    // Act
    const res = await as(req().get('/api/clients'), owner);

    // Assert
    expect(res.status).toBe(200);
  });

  it('locks the account when the first charge fails', async () => {
    // Arrange
    const { owner, customerId, subscriptionId, trialEnd } =
      await trialingOwner();

    // Act
    await send(
      'invoice.payment_failed',
      invoice(customerId, subscriptionId, 2900, trialEnd + 30 * DAY),
    );
    const res = await as(req().get('/api/clients'), owner);

    // Assert
    expect({
      status: (await statusOf(owner.user.businessId)).status,
      access: res.status,
    }).toEqual({ status: 'locked', access: 403 });
  });

  it('lets a locked owner reach pay-now to fix a failed or expired card', async () => {
    // Arrange
    const { owner, customerId, subscriptionId, trialEnd } =
      await trialingOwner();
    await send(
      'invoice.payment_failed',
      invoice(customerId, subscriptionId, 2900, trialEnd + 30 * DAY),
    );

    // Act
    const res = await as(req().post('/api/subscription/pay-now'), owner);

    // Assert
    expect(res.status).toBe(200);
  });

  it('restores access when a retried payment succeeds', async () => {
    // Arrange
    const { owner, customerId, subscriptionId, trialEnd } =
      await trialingOwner();
    const failed = invoice(
      customerId,
      subscriptionId,
      2900,
      trialEnd + 30 * DAY,
    );
    await send('invoice.payment_failed', failed);

    // Act
    await send('invoice.payment_succeeded', { ...failed, id: next('in') });
    const res = await as(req().get('/api/clients'), owner);

    // Assert
    expect(res.status).toBe(200);
  });

  it('cancels and removes access when the trial is cancelled before it ends', async () => {
    // Arrange
    const { owner, customerId, subscriptionId } = await trialingOwner();

    // Act
    await send('customer.subscription.deleted', {
      id: subscriptionId,
      customer: customerId,
      trial_end: null,
    });
    const res = await as(req().get('/api/clients'), owner);

    // Assert
    expect({
      status: (await statusOf(owner.user.businessId)).status,
      access: res.status,
    }).toEqual({ status: 'canceled', access: 403 });
  });
});
