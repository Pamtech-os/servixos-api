import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { SubscriptionService } from 'src/modules/subscription/services/subscription.service';
import { SubscriptionRepository } from 'src/modules/subscription/repositories/subscription.repository';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { StripeService } from 'src/modules/stripe/services/stripe.service';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from 'src/modules/business/schemas/business.schema';
import {
  TransactionStatus,
  TransactionType,
} from 'src/modules/subscription/schemas/subscription-transaction.schema';
import { asMock } from 'test/helpers/mock';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { OnboardingStage } from 'src/modules/users/schemas/user.schema';
import { SupportedCountry } from 'src/common/constants/countries.constants';
import { BILLING_TERMS_VERSION } from 'src/common/constants/billing.constants';

const BUSINESS_ID = '664abc123456789012345678';
const STRIPE_CUSTOMER_ID = 'cus_test123456';
const STRIPE_SUBSCRIPTION_ID = 'sub_test123456';
const STRIPE_PRICE_ID_MONTHLY = 'price_starter_monthly';
const STRIPE_PRICE_ID_YEARLY = 'price_starter_yearly';
const STRIPE_GROWTH_PRICE_ID = 'price_growth_monthly';

const OWNER_ID = new Types.ObjectId();
const baseBusiness = {
  _id: new Types.ObjectId(BUSINESS_ID),
  ownerId: OWNER_ID,
  name: 'Acme Co',
  email: 'owner@acme.com',
  stripeCustomerId: STRIPE_CUSTOMER_ID,
  stripeSubscriptionId: null as string | null,
  billingInterval: 'monthly' as const,
  subscription: {
    plan: SubscriptionPlan.STARTER,
    status: SubscriptionStatus.TRIALING,
    features: [] as string[],
  },
};

const starterPlan = {
  _id: new Types.ObjectId(),
  slug: SubscriptionPlan.STARTER,
  name: 'Starter',
  stripePriceIdMonthly: STRIPE_PRICE_ID_MONTHLY,
  stripePriceIdYearly: STRIPE_PRICE_ID_YEARLY,
  isActive: true,
};

const growthPlan = {
  _id: new Types.ObjectId(),
  slug: SubscriptionPlan.GROWTH,
  name: 'Growth',
  stripePriceIdMonthly: STRIPE_GROWTH_PRICE_ID,
  stripePriceIdYearly: 'price_growth_yearly',
  isActive: true,
};

const stripeSubscription = {
  id: STRIPE_SUBSCRIPTION_ID,
  trial_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
};

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let subscriptionRepository: {
    findAllActivePlans: jest.Mock;
    findPlanBySlug: jest.Mock;
    findPlanByPriceId: jest.Mock;
    createTransaction: jest.Mock;
    updateTransactionByEventId: jest.Mock;
    findTransactionsByBusiness: jest.Mock;
    upsertPlan: jest.Mock;
  };
  let businessRepository: {
    findById: jest.Mock;
    updateById: jest.Mock;
    findByStripeCustomerId: jest.Mock;
  };
  let stripeService: {
    createSetupIntent: jest.Mock;
    attachPaymentMethod: jest.Mock;
    createSubscription: jest.Mock;
    updateSubscriptionPrice: jest.Mock;
    cancelSubscription: jest.Mock;
    getLatestOpenInvoice: jest.Mock;
    getInvoicePaymentClientSecret: jest.Mock;
    getPriceInCurrency: jest.Mock;
    createCustomer: jest.Mock;
  };
  let usersRepository: { findById: jest.Mock; updateById: jest.Mock };
  let configValues: Record<string, string>;

  beforeEach(() => {
    subscriptionRepository = {
      findAllActivePlans: jest
        .fn()
        .mockResolvedValue([starterPlan, growthPlan]),
      findPlanBySlug: jest.fn().mockResolvedValue(starterPlan),
      findPlanByPriceId: jest.fn().mockResolvedValue(starterPlan),
      createTransaction: jest.fn().mockResolvedValue({}),
      updateTransactionByEventId: jest.fn().mockResolvedValue(undefined),
      findTransactionsByBusiness: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0 }),
      upsertPlan: jest.fn().mockResolvedValue(undefined),
    };

    businessRepository = {
      findById: jest.fn().mockResolvedValue(baseBusiness),
      updateById: jest.fn().mockResolvedValue(undefined),
      findByStripeCustomerId: jest.fn().mockResolvedValue(baseBusiness),
    };

    stripeService = {
      createSetupIntent: jest
        .fn()
        .mockResolvedValue({ clientSecret: 'seti_secret_xyz' }),
      attachPaymentMethod: jest.fn().mockResolvedValue(undefined),
      createSubscription: jest.fn().mockResolvedValue(stripeSubscription),
      updateSubscriptionPrice: jest
        .fn()
        .mockResolvedValue({ id: STRIPE_SUBSCRIPTION_ID }),
      cancelSubscription: jest
        .fn()
        .mockResolvedValue({ id: STRIPE_SUBSCRIPTION_ID }),
      getLatestOpenInvoice: jest.fn().mockResolvedValue({
        id: 'in_test',
        amount_due: 2900,
        currency: 'usd',
      }),
      getInvoicePaymentClientSecret: jest
        .fn()
        .mockResolvedValue({ clientSecret: 'pi_secret', invoiceId: 'in_test' }),
      getPriceInCurrency: jest.fn().mockResolvedValue({
        amount: 2900,
        currency: 'usd',
        interval: 'month',
      }),
      createCustomer: jest.fn().mockResolvedValue({ id: 'cus_new' }),
    };
    usersRepository = {
      findById: jest.fn().mockResolvedValue({ email: 'owner@acme.com' }),
      updateById: jest.fn().mockResolvedValue(null),
    };
    configValues = {};

    service = new SubscriptionService(
      asMock<SubscriptionRepository>(subscriptionRepository),
      asMock<BusinessRepository>(businessRepository),
      asMock<StripeService>(stripeService),
      asMock<UsersRepository>(usersRepository),
      asMock<ConfigService>({
        get: jest.fn((key: string) => configValues[key]),
      }),
    );
  });

  // ─── getPlans ───────────────────────────────────────────────────────────────

  describe('getPlans', () => {
    it('returns all active plans from the repository', async () => {
      // Arrange
      subscriptionRepository.findAllActivePlans.mockResolvedValue([
        starterPlan,
        growthPlan,
      ]);

      // Act
      const result = await service.getPlans();

      // Assert
      expect(result.data).toEqual([starterPlan, growthPlan]);
      expect(subscriptionRepository.findAllActivePlans).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  // ─── createSetupIntent ──────────────────────────────────────────────────────

  describe('createSetupIntent', () => {
    it('returns clientSecret from Stripe when business has a Stripe customer', async () => {
      // Arrange
      stripeService.createSetupIntent.mockResolvedValue({
        clientSecret: 'seti_secret_abc',
      });

      // Act
      const result = await service.createSetupIntent(BUSINESS_ID);

      // Assert
      expect(result.data).toEqual({ clientSecret: 'seti_secret_abc' });
      expect(stripeService.createSetupIntent).toHaveBeenCalledWith(
        STRIPE_CUSTOMER_ID,
      );
    });

    it('creates the Stripe customer on demand when it does not exist yet', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeCustomerId: undefined,
      });

      // Act
      await service.createSetupIntent(BUSINESS_ID);

      // Assert
      expect(stripeService.createSetupIntent).toHaveBeenCalledWith('cus_new');
    });

    it('returns clientSecret for a LOCKED business so they can update their card', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        subscription: {
          ...baseBusiness.subscription,
          status: SubscriptionStatus.LOCKED,
        },
      });
      stripeService.createSetupIntent.mockResolvedValue({
        clientSecret: 'seti_secret_locked',
      });

      // Act
      const result = await service.createSetupIntent(BUSINESS_ID);

      // Assert
      expect(result.data).toEqual({ clientSecret: 'seti_secret_locked' });
      expect(stripeService.createSetupIntent).toHaveBeenCalledWith(
        STRIPE_CUSTOMER_ID,
      );
    });

    it('throws NotFoundException when business is not found', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.createSetupIntent(BUSINESS_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── subscribe ──────────────────────────────────────────────────────────────

  describe('subscribe', () => {
    const dto = {
      plan: SubscriptionPlan.STARTER,
      billingInterval: 'monthly' as const,
      acceptTerms: true,
      termsVersion: BILLING_TERMS_VERSION,
    };

    it('creates a Stripe subscription with a free trial and returns trialEndsAt', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeSubscriptionId: null,
      });
      subscriptionRepository.findPlanBySlug.mockResolvedValue(starterPlan);
      stripeService.createSubscription.mockResolvedValue(stripeSubscription);

      // Act
      const result = await service.subscribe(BUSINESS_ID, dto);

      // Assert
      expect(stripeService.createSubscription).toHaveBeenCalledWith(
        STRIPE_CUSTOMER_ID,
        STRIPE_PRICE_ID_MONTHLY,
        { businessId: BUSINESS_ID },
        `subscribe:${BUSINESS_ID}:${SubscriptionPlan.STARTER}:monthly`,
        { currency: 'usd', cancelIfNoPaymentMethod: true, automaticTax: false },
      );
      expect(result.data).toHaveProperty('trialEndsAt');
    });

    it('selects yearly price when billingInterval is yearly', async () => {
      // Arrange
      const yearlyDto = { ...dto, billingInterval: 'yearly' as const };
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeSubscriptionId: null,
      });
      subscriptionRepository.findPlanBySlug.mockResolvedValue(starterPlan);

      // Act
      await service.subscribe(BUSINESS_ID, yearlyDto);

      // Assert
      expect(stripeService.createSubscription).toHaveBeenCalledWith(
        STRIPE_CUSTOMER_ID,
        STRIPE_PRICE_ID_YEARLY,
        expect.any(Object),
        expect.any(String),
        expect.any(Object),
      );
    });

    it('attaches payment method before subscribing when paymentMethodId is provided', async () => {
      // Arrange
      const dtoWithCard = { ...dto, paymentMethodId: 'pm_test_visa' };
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeSubscriptionId: null,
      });

      // Act
      await service.subscribe(BUSINESS_ID, dtoWithCard);

      // Assert
      expect(stripeService.attachPaymentMethod).toHaveBeenCalledWith(
        STRIPE_CUSTOMER_ID,
        'pm_test_visa',
      );
    });

    it('throws ConflictException when business already has a subscription', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
      });

      // Act & Assert
      await expect(service.subscribe(BUSINESS_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates the Stripe customer when the async setup job has not run yet', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeCustomerId: undefined,
      });

      // Act
      await service.subscribe(BUSINESS_ID, dto);

      // Assert
      expect(stripeService.createCustomer).toHaveBeenCalledWith(
        'owner@acme.com',
        'Acme Co',
        { businessId: BUSINESS_ID },
        `customer:${BUSINESS_ID}`,
      );
    });

    it('rejects when the subscription terms were not accepted', async () => {
      // Arrange
      const declined = { ...dto, acceptTerms: false };

      // Act
      const call = service.subscribe(BUSINESS_ID, declined);

      // Assert
      await expect(call).rejects.toThrow(BadRequestException);
    });

    it('rejects consent given to an outdated version of the terms', async () => {
      // Arrange
      const outdated = { ...dto, termsVersion: '2020-01-01' };

      // Act
      const call = service.subscribe(BUSINESS_ID, outdated);

      // Assert
      await expect(call).rejects.toThrow(BadRequestException);
    });

    it('requires a payment method when card-before-access is on', async () => {
      // Arrange
      configValues.REQUIRE_PAYMENT_METHOD = 'true';

      // Act
      const call = service.subscribe(BUSINESS_ID, dto);

      // Assert
      await expect(call).rejects.toThrow(BadRequestException);
    });

    it('starts the trial and records the consent with the disclosed price', async () => {
      // Arrange
      const withCard = { ...dto, paymentMethodId: 'pm_test_visa' };

      // Act
      await service.subscribe(BUSINESS_ID, withCard, {
        ipAddress: '1.2.3.4',
        userAgent: 'jest',
      });

      // Assert
      expect(businessRepository.updateById.mock.calls[0]).toMatchObject([
        BUSINESS_ID,
        {
          'subscription.status': SubscriptionStatus.TRIALING,
          'subscription.hasPaymentMethod': true,
          billingConsent: {
            termsVersion: BILLING_TERMS_VERSION,
            amount: 2900,
            currency: 'USD',
            ipAddress: '1.2.3.4',
            firstChargeAt: new Date(stripeSubscription.trial_end * 1000),
          },
        },
      ]);
    });

    it('marks the owner onboarding as complete', async () => {
      // Arrange — default dto

      // Act
      await service.subscribe(BUSINESS_ID, dto);

      // Assert
      expect(usersRepository.updateById).toHaveBeenCalledWith(OWNER_ID, {
        onboardingStage: OnboardingStage.COMPLETE,
      });
    });

    it('bills in the local currency of the business country', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        country: SupportedCountry.NG,
      });

      // Act
      await service.subscribe(BUSINESS_ID, dto);

      // Assert
      expect(stripeService.getPriceInCurrency).toHaveBeenCalledWith(
        STRIPE_PRICE_ID_MONTHLY,
        'NGN',
      );
    });

    it('throws NotFoundException when plan does not exist', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeSubscriptionId: null,
      });
      subscriptionRepository.findPlanBySlug.mockResolvedValue(null);

      // Act & Assert
      await expect(service.subscribe(BUSINESS_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('creates a PENDING TRIAL_START transaction after subscribing', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeSubscriptionId: null,
      });
      subscriptionRepository.findPlanBySlug.mockResolvedValue(starterPlan);

      // Act
      await service.subscribe(BUSINESS_ID, dto);

      // Assert
      expect(subscriptionRepository.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.TRIAL_START,
          status: TransactionStatus.PENDING,
          plan: SubscriptionPlan.STARTER,
        }),
      );
    });
  });

  // ─── upgrade ────────────────────────────────────────────────────────────────

  describe('upgrade', () => {
    const activeBusinessWithSub = {
      ...baseBusiness,
      stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
      subscription: {
        ...baseBusiness.subscription,
        status: SubscriptionStatus.ACTIVE,
      },
    };

    it('upgrades to a higher plan and updates the price on Stripe', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue(activeBusinessWithSub);
      subscriptionRepository.findPlanBySlug.mockResolvedValue(growthPlan);
      const dto = {
        plan: SubscriptionPlan.GROWTH,
        billingInterval: 'monthly' as const,
      };

      // Act
      const result = await service.upgrade(BUSINESS_ID, dto);

      // Assert
      expect(stripeService.updateSubscriptionPrice).toHaveBeenCalledWith(
        STRIPE_SUBSCRIPTION_ID,
        STRIPE_GROWTH_PRICE_ID,
        expect.stringContaining(`upgrade:${BUSINESS_ID}`),
      );
      expect(result).toHaveProperty('message');
    });

    it('returns BadRequestException when upgrading to the same plan', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue(activeBusinessWithSub);
      const dto = {
        plan: SubscriptionPlan.STARTER,
        billingInterval: 'monthly' as const,
      };

      // Act
      const result = await service.upgrade(BUSINESS_ID, dto);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
    });

    it('returns BadRequestException when attempting to downgrade', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...activeBusinessWithSub,
        subscription: {
          ...activeBusinessWithSub.subscription,
          plan: SubscriptionPlan.PRO,
        },
      });
      const dto = {
        plan: SubscriptionPlan.STARTER,
        billingInterval: 'monthly' as const,
      };

      // Act
      const result = await service.upgrade(BUSINESS_ID, dto);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
      expect(stripeService.updateSubscriptionPrice).not.toHaveBeenCalled();
    });

    it('returns NotFoundException when business has no active subscription', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...activeBusinessWithSub,
        stripeSubscriptionId: null,
      });
      const dto = {
        plan: SubscriptionPlan.GROWTH,
        billingInterval: 'monthly' as const,
      };

      // Act
      const result = await service.upgrade(BUSINESS_ID, dto);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('creates a PENDING PLAN_UPGRADED transaction', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue(activeBusinessWithSub);
      subscriptionRepository.findPlanBySlug.mockResolvedValue(growthPlan);
      const dto = {
        plan: SubscriptionPlan.GROWTH,
        billingInterval: 'monthly' as const,
      };

      // Act
      await service.upgrade(BUSINESS_ID, dto);

      // Assert
      expect(subscriptionRepository.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.PLAN_UPGRADED,
          status: TransactionStatus.PENDING,
          plan: SubscriptionPlan.GROWTH,
        }),
      );
    });

    it('returns InternalServerErrorException when Stripe call throws', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue(activeBusinessWithSub);
      subscriptionRepository.findPlanBySlug.mockResolvedValue(growthPlan);
      stripeService.updateSubscriptionPrice.mockRejectedValue(
        new Error('Stripe error'),
      );
      const dto = {
        plan: SubscriptionPlan.GROWTH,
        billingInterval: 'monthly' as const,
      };

      // Act
      const result = await service.upgrade(BUSINESS_ID, dto);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels the subscription at period end via Stripe', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
      });

      // Act
      await service.cancel(BUSINESS_ID);

      // Assert
      expect(stripeService.cancelSubscription).toHaveBeenCalledWith(
        STRIPE_SUBSCRIPTION_ID,
        true,
        expect.stringContaining(`cancel:${BUSINESS_ID}`),
      );
    });

    it('returns NotFoundException when there is no active subscription', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeSubscriptionId: null,
      });

      // Act
      const result = await service.cancel(BUSINESS_ID);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect(stripeService.cancelSubscription).not.toHaveBeenCalled();
    });

    it('creates a PENDING CANCELED transaction', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
      });

      // Act
      await service.cancel(BUSINESS_ID);

      // Assert
      expect(subscriptionRepository.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.CANCELED,
          status: TransactionStatus.PENDING,
        }),
      );
    });
  });

  // ─── getPayNowClientSecret ──────────────────────────────────────────────────

  describe('getPayNowClientSecret', () => {
    it('returns clientSecret and invoice details for an open invoice', async () => {
      // Arrange
      const openInvoice = { id: 'in_open', amount_due: 7900, currency: 'usd' };
      stripeService.getLatestOpenInvoice.mockResolvedValue(openInvoice);
      stripeService.getInvoicePaymentClientSecret.mockResolvedValue({
        clientSecret: 'pi_secret_xyz',
        invoiceId: 'in_open',
      });

      // Act
      const result = await service.getPayNowClientSecret(BUSINESS_ID);

      // Assert
      expect(result).toHaveProperty('data');
      const data = (result as { data: Record<string, unknown> }).data;
      expect(data).toMatchObject({
        clientSecret: 'pi_secret_xyz',
        invoiceId: 'in_open',
        amountDue: 7900,
        currency: 'usd',
      });
    });

    it('returns NotFoundException when no open invoice exists', async () => {
      // Arrange
      stripeService.getLatestOpenInvoice.mockResolvedValue(null);

      // Act
      const result = await service.getPayNowClientSecret(BUSINESS_ID);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('returns NotFoundException when business has no Stripe customer', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        stripeCustomerId: undefined,
      });

      // Act
      const result = await service.getPayNowClientSecret(BUSINESS_ID);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });

  // ─── getTransactions ────────────────────────────────────────────────────────

  describe('getTransactions', () => {
    it('returns paginated transaction history with meta', async () => {
      // Arrange
      const tx = {
        _id: new Types.ObjectId(),
        type: TransactionType.TRIAL_START,
      };
      subscriptionRepository.findTransactionsByBusiness.mockResolvedValue({
        data: [tx],
        total: 1,
      });

      // Act
      const result = await service.getTransactions(BUSINESS_ID, {
        page: 1,
        limit: 10,
      });

      // Assert
      expect(result.data).toEqual([tx]);
      expect(result.meta).toMatchObject({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it('queries with the resolved page and limit when none provided', async () => {
      // Arrange
      subscriptionRepository.findTransactionsByBusiness.mockResolvedValue({
        data: [],
        total: 0,
      });

      // Act
      await service.getTransactions(BUSINESS_ID, {});

      // Assert
      expect(
        subscriptionRepository.findTransactionsByBusiness,
      ).toHaveBeenCalledWith(BUSINESS_ID, 1, expect.any(Number));
    });
  });

  // ─── getTrialQuote ──────────────────────────────────────────────────────────

  describe('getTrialQuote', () => {
    const quoteDto = {
      plan: SubscriptionPlan.STARTER,
      billingInterval: 'monthly' as const,
    };

    it('discloses the price, trial end, first charge date and terms version', async () => {
      // Arrange
      businessRepository.findById.mockResolvedValue({
        ...baseBusiness,
        country: SupportedCountry.GB,
      });
      stripeService.getPriceInCurrency.mockResolvedValue({
        amount: 2400,
        currency: 'gbp',
        interval: 'month',
      });

      // Act
      const result = await service.getTrialQuote(BUSINESS_ID, quoteDto);

      // Assert
      expect(result.data).toMatchObject({
        planName: 'Starter',
        amount: 2400,
        currency: 'GBP',
        formattedAmount: '£24.00',
        trialDays: 7,
        taxMode: 'none',
        termsVersion: BILLING_TERMS_VERSION,
      });
    });

    it('sets the first charge for seven days from now', async () => {
      // Arrange
      const before = Date.now();

      // Act
      const result = await service.getTrialQuote(BUSINESS_ID, quoteDto);

      // Assert
      const firstChargeAt = (result.data as { firstChargeAt: Date })
        .firstChargeAt;
      const days = (firstChargeAt.getTime() - before) / 86_400_000;
      expect(Math.round(days)).toBe(7);
    });

    it('returns ServiceUnavailable when Stripe pricing cannot be loaded', async () => {
      // Arrange
      stripeService.getPriceInCurrency.mockRejectedValue(new Error('stripe'));
      jest.spyOn(Reflect.get(service, 'logger'), 'error').mockImplementation();

      // Act
      const call = service.getTrialQuote(BUSINESS_ID, quoteDto);

      // Assert
      await expect(call).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
