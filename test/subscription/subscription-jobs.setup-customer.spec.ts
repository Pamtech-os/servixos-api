import { Types, type Connection } from 'mongoose';
import type { Job } from 'agenda';

jest.mock('@typegoose/typegoose', () => {
  const actual = jest.requireActual<typeof import('@typegoose/typegoose')>(
    '@typegoose/typegoose',
  );
  return { ...actual, getModelForClass: jest.fn().mockReturnValue({}) };
});

import {
  SubscriptionJobsService,
  type SetupStripeCustomerJobData,
} from 'src/modules/subscription/jobs/subscription-jobs.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { SubscriptionRepository } from 'src/modules/subscription/repositories/subscription.repository';
import { StripeService } from 'src/modules/stripe/services/stripe.service';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { EmailService } from 'src/modules/email/services/email.service';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPlan } from 'src/modules/business/schemas/business.schema';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = new Types.ObjectId().toString();
const BASE_DATA: SetupStripeCustomerJobData = {
  businessId: BUSINESS_ID,
  email: 'owner@acme.com',
  name: 'Acme',
  plan: SubscriptionPlan.STARTER,
  billingInterval: 'monthly',
};

describe('SubscriptionJobsService — handleSetupStripeCustomer', () => {
  let service: SubscriptionJobsService;
  let stripeService: {
    createCustomer: jest.Mock;
    createSubscription: jest.Mock;
  };

  type Handler = (job: Job<SetupStripeCustomerJobData>) => Promise<void>;
  const run = (data: SetupStripeCustomerJobData): Promise<void> => {
    const handler = Reflect.get(
      service,
      'handleSetupStripeCustomer',
    ) as Handler;
    const job = { attrs: { data } } as Job<SetupStripeCustomerJobData>;
    return Reflect.apply(handler, service, [job]);
  };

  beforeEach(() => {
    stripeService = {
      createCustomer: jest.fn().mockResolvedValue({ id: 'cus_1' }),
      createSubscription: jest.fn().mockResolvedValue({ id: 'sub_1' }),
    };
    service = new SubscriptionJobsService(
      { model: jest.fn() } as never as Connection,
      asMock<AgendaService>({ define: jest.fn(), now: jest.fn() }),
      asMock<BusinessRepository>({
        findById: jest.fn().mockResolvedValue({ _id: BUSINESS_ID }),
        updateById: jest.fn().mockResolvedValue(undefined),
      }),
      asMock<SubscriptionRepository>({
        findPlanBySlug: jest
          .fn()
          .mockResolvedValue({ stripePriceIdMonthly: 'price_m' }),
        createTransaction: jest.fn().mockResolvedValue({}),
      }),
      asMock<StripeService>(stripeService),
      asMock<EmailService>({}),
      asMock<ConfigService>({ get: jest.fn() }),
    );
  });

  it('creates only the customer when the card-less trial is disabled', async () => {
    // Arrange
    const data = { ...BASE_DATA, createTrialSubscription: false };

    // Act
    await run(data);

    // Assert
    expect(stripeService.createSubscription).not.toHaveBeenCalled();
  });

  it('keeps creating the card-less trial for jobs queued before the flag existed', async () => {
    // Arrange
    const data = { ...BASE_DATA };

    // Act
    await run(data);

    // Assert
    expect(stripeService.createSubscription).toHaveBeenCalled();
  });

  it('uses the shared idempotency key so a concurrent subscribe yields one customer', async () => {
    // Arrange
    const data = { ...BASE_DATA, createTrialSubscription: false };

    // Act
    await run(data);

    // Assert
    expect(stripeService.createCustomer).toHaveBeenCalledWith(
      'owner@acme.com',
      'Acme',
      { businessId: BUSINESS_ID },
      `customer:${BUSINESS_ID}`,
    );
  });
});
