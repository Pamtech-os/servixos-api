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
  type CardSavedJobData,
} from 'src/modules/subscription/jobs/subscription-jobs.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { SubscriptionRepository } from 'src/modules/subscription/repositories/subscription.repository';
import { StripeService } from 'src/modules/stripe/services/stripe.service';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { EmailService } from 'src/modules/email/services/email.service';
import { ConfigService } from '@nestjs/config';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = '664abc123456789012345678';
const STRIPE_CUSTOMER_ID = 'cus_test123456';
const PAYMENT_METHOD_ID = 'pm_card_new';

const baseBusiness = {
  _id: new Types.ObjectId(BUSINESS_ID),
  email: 'owner@acme.com',
  name: 'Acme Co',
  subscription: { plan: 'starter', hasPaymentMethod: false },
};

type PrivateHandlers = {
  handleCardSaved: (job: Job<CardSavedJobData>) => Promise<void>;
};

function makeJob(data: CardSavedJobData): Job<CardSavedJobData> {
  return { attrs: { data } } as unknown as Job<CardSavedJobData>;
}

describe('SubscriptionJobsService — handleCardSaved', () => {
  let service: SubscriptionJobsService;
  let businessRepository: {
    findByStripeCustomerId: jest.Mock;
    updateById: jest.Mock;
  };
  let stripeService: { attachPaymentMethod: jest.Mock };

  beforeEach(() => {
    businessRepository = {
      findByStripeCustomerId: jest.fn().mockResolvedValue(baseBusiness),
      updateById: jest.fn().mockResolvedValue(undefined),
    };

    stripeService = {
      attachPaymentMethod: jest.fn().mockResolvedValue(undefined),
    };

    const agendaService = { define: jest.fn(), now: jest.fn() };
    const emailService = { send: jest.fn() };
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    const connection = { model: jest.fn() } as unknown as Connection;

    service = new SubscriptionJobsService(
      connection,
      asMock<AgendaService>(agendaService),
      asMock<BusinessRepository>(businessRepository),
      asMock<SubscriptionRepository>({}),
      asMock<StripeService>(stripeService),
      asMock<EmailService>(emailService),
      asMock<ConfigService>(configService),
    );
  });

  it('attaches the new card as the Stripe default and marks hasPaymentMethod', async () => {
    // Arrange
    const job = makeJob({
      stripeEventId: 'evt_001',
      customerId: STRIPE_CUSTOMER_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    // Act
    await (service as unknown as PrivateHandlers).handleCardSaved(job);

    // Assert
    expect(stripeService.attachPaymentMethod).toHaveBeenCalledWith(
      STRIPE_CUSTOMER_ID,
      PAYMENT_METHOD_ID,
    );
    expect(businessRepository.updateById).toHaveBeenCalledWith(BUSINESS_ID, {
      'subscription.hasPaymentMethod': true,
    });
  });

  it('calls Stripe attach before the DB write', async () => {
    // Arrange
    const job = makeJob({
      stripeEventId: 'evt_002',
      customerId: STRIPE_CUSTOMER_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    // Act
    await (service as unknown as PrivateHandlers).handleCardSaved(job);

    // Assert
    const attachOrder =
      stripeService.attachPaymentMethod.mock.invocationCallOrder[0];
    const updateOrder =
      businessRepository.updateById.mock.invocationCallOrder[0];
    expect(attachOrder).toBeLessThan(updateOrder);
  });

  it('returns early without calling Stripe or DB when business is not found', async () => {
    // Arrange
    businessRepository.findByStripeCustomerId.mockResolvedValue(null);
    const job = makeJob({
      stripeEventId: 'evt_003',
      customerId: 'cus_unknown',
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    // Act
    await (service as unknown as PrivateHandlers).handleCardSaved(job);

    // Assert
    expect(stripeService.attachPaymentMethod).not.toHaveBeenCalled();
    expect(businessRepository.updateById).not.toHaveBeenCalled();
  });
});
