import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { SUBSCRIPTION_MESSAGES } from 'src/common/constants/messages/subscription.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import {
  getFeaturesForPlan,
  PLAN_ORDER,
  TRIAL_PERIOD_DAYS,
} from 'src/common/constants/subscription-features.constants';
import { ConfigService } from '@nestjs/config';
import { COUNTRY_CONFIG } from 'src/common/constants/countries.constants';
import {
  BILLING_TERMS_VERSION,
  TaxMode,
} from 'src/common/constants/billing.constants';
import {
  getTaxMode,
  isPaymentMethodRequired,
} from 'src/common/utils/billing.util';
import {
  Business,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../business/schemas/business.schema';
import { UsersRepository } from '../../users/repositories/users.repository';
import { OnboardingStage } from '../../users/schemas/user.schema';
import type { TrialQuoteDto } from '../dto/trial-quote.dto';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { StripeService } from '../../stripe/services/stripe.service';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import {
  TransactionStatus,
  TransactionType,
} from '../schemas/subscription-transaction.schema';
import type { ServiceResponse } from 'src/common/dto/response.dto';
import { SubscribeDto } from '../dto/subscribe.dto';
import { UpgradeDto } from '../dto/upgrade.dto';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import type { PaginationDto } from 'src/common/dto/pagination.dto';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly stripeService: StripeService,
    private readonly usersRepository: UsersRepository,
    private readonly config: ConfigService,
  ) {}

  /** Returns all active plans with their features and pricing. */
  async getPlans(): Promise<ServiceResponse> {
    const plans = await this.subscriptionRepository.findAllActivePlans();
    return {
      message: SUBSCRIPTION_MESSAGES.SUCCESS.PLANS_RETRIEVED,
      data: plans,
    };
  }

  /**
   * Creates a Stripe SetupIntent so the frontend can collect a payment method
   * using Stripe.js without an immediate charge.
   */
  async createSetupIntent(businessId: string): Promise<ServiceResponse> {
    const business = await this.businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundException(
        SUBSCRIPTION_MESSAGES.ERROR.NO_STRIPE_CUSTOMER,
      );
    }

    const customerId = await this.ensureCustomer(business);
    const { clientSecret } =
      await this.stripeService.createSetupIntent(customerId);

    return {
      message: SUBSCRIPTION_MESSAGES.SUCCESS.SETUP_INTENT_CREATED,
      data: { clientSecret },
    };
  }

  /**
   * Discloses exactly what starting the trial means: local price, trial end and
   * first charge date, billing frequency, tax treatment and cancellation terms.
   */
  async getTrialQuote(
    businessId: string,
    dto: TrialQuoteDto,
  ): Promise<ServiceResponse> {
    const business = await this.businessRepository.findById(businessId);
    if (!business) throw new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);

    const { planName, price } = await this.resolveLocalPrice(
      business,
      dto.plan,
      dto.billingInterval,
    );
    const firstChargeAt = trialEndFrom(new Date());
    const taxMode = getTaxMode(this.config);

    return {
      message: SUBSCRIPTION_MESSAGES.SUCCESS.QUOTE_RETRIEVED,
      data: {
        plan: dto.plan,
        planName,
        billingInterval: dto.billingInterval,
        amount: price.amount,
        currency: price.currency.toUpperCase(),
        formattedAmount: formatMoney(price.amount, price.currency),
        trialDays: TRIAL_PERIOD_DAYS,
        trialEndsAt: firstChargeAt,
        firstChargeAt,
        taxMode,
        terms: {
          trial: SUBSCRIPTION_MESSAGES.TERMS.TRIAL(TRIAL_PERIOD_DAYS),
          cancellation:
            SUBSCRIPTION_MESSAGES.TERMS.CANCELLATION(TRIAL_PERIOD_DAYS),
          reminder: SUBSCRIPTION_MESSAGES.TERMS.REMINDER,
          tax: TAX_NOTES[taxMode],
        },
        termsVersion: BILLING_TERMS_VERSION,
      },
    };
  }

  /**
   * Starts the 7-day free trial on the chosen plan after the owner consents to
   * the disclosed terms. Stripe cancels (never charges) a trial that ends
   * without a payment method; the first charge happens at trial end.
   */
  async subscribe(
    businessId: string,
    dto: SubscribeDto,
    context: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<ServiceResponse> {
    if (dto.acceptTerms !== true) {
      throw new BadRequestException(
        SUBSCRIPTION_MESSAGES.ERROR.TERMS_NOT_ACCEPTED,
      );
    }
    if (dto.termsVersion !== BILLING_TERMS_VERSION) {
      throw new BadRequestException(SUBSCRIPTION_MESSAGES.ERROR.TERMS_OUTDATED);
    }
    if (isPaymentMethodRequired(this.config) && !dto.paymentMethodId) {
      throw new BadRequestException(
        SUBSCRIPTION_MESSAGES.ERROR.PAYMENT_METHOD_REQUIRED,
      );
    }

    const business = await this.businessRepository.findById(businessId);
    if (!business) throw new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);

    if (business.stripeSubscriptionId) {
      throw new ConflictException(
        SUBSCRIPTION_MESSAGES.ERROR.ALREADY_SUBSCRIBED,
      );
    }

    const customerId = await this.ensureCustomer(business);
    const { priceId, price } = await this.resolveLocalPrice(
      business,
      dto.plan,
      dto.billingInterval,
    );

    // Attach the card first so the trial converts to paid without user action
    if (dto.paymentMethodId) {
      await this.stripeService.attachPaymentMethod(
        customerId,
        dto.paymentMethodId,
      );
    }

    const idempotencyKey = `subscribe:${businessId}:${dto.plan}:${dto.billingInterval}`;
    const subscription = await this.stripeService.createSubscription(
      customerId,
      priceId,
      { businessId },
      idempotencyKey,
      {
        currency: price.currency,
        cancelIfNoPaymentMethod: true,
        automaticTax: getTaxMode(this.config) !== TaxMode.NONE,
      },
    );

    const trialEndsAt = new Date((subscription.trial_end ?? 0) * 1000);

    await this.businessRepository.updateById(businessId, {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      billingInterval: dto.billingInterval,
      'subscription.plan': dto.plan,
      'subscription.features': getFeaturesForPlan(dto.plan),
      'subscription.status': SubscriptionStatus.TRIALING,
      'subscription.trialEndsAt': trialEndsAt,
      ...(dto.paymentMethodId && { 'subscription.hasPaymentMethod': true }),
      billingConsent: {
        termsVersion: BILLING_TERMS_VERSION,
        acceptedAt: new Date(),
        plan: dto.plan,
        billingInterval: dto.billingInterval,
        amount: price.amount,
        currency: price.currency.toUpperCase(),
        firstChargeAt: trialEndsAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    await this.usersRepository.updateById(business.ownerId, {
      onboardingStage: OnboardingStage.COMPLETE,
    });

    // Audit trail — pending until webhook confirms
    await this.subscriptionRepository.createTransaction({
      businessId: new Types.ObjectId(businessId),
      type: TransactionType.TRIAL_START,
      status: TransactionStatus.PENDING,
      plan: dto.plan,
      billingInterval: dto.billingInterval,
      stripeSubscriptionId: subscription.id,
    });

    return {
      message: SUBSCRIPTION_MESSAGES.SUCCESS.SUBSCRIBED,
      data: { trialEndsAt, firstChargeAt: trialEndsAt },
    };
  }

  /**
   * Upgrades the business to a higher-tier plan.
   * Only upgrades are allowed (no downgrades).
   */
  async upgrade(
    businessId: string,
    dto: UpgradeDto,
  ): Promise<
    | ServiceResponse
    | BadRequestException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const business = await this.businessRepository.findById(businessId);
      if (!business)
        throw new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);

      const currentPlan = business.subscription.plan;

      if (dto.plan === currentPlan) {
        return new BadRequestException(SUBSCRIPTION_MESSAGES.ERROR.SAME_PLAN);
      }

      if (PLAN_ORDER[dto.plan] <= PLAN_ORDER[currentPlan]) {
        return new BadRequestException(
          SUBSCRIPTION_MESSAGES.ERROR.UPGRADE_NOT_ALLOWED,
        );
      }

      if (!business.stripeSubscriptionId) {
        return new NotFoundException(
          SUBSCRIPTION_MESSAGES.ERROR.NO_SUBSCRIPTION,
        );
      }

      const plan = await this.subscriptionRepository.findPlanBySlug(dto.plan);
      if (!plan)
        return new NotFoundException(
          SUBSCRIPTION_MESSAGES.ERROR.PLAN_NOT_FOUND,
        );

      const priceId =
        dto.billingInterval === 'yearly'
          ? plan.stripePriceIdYearly
          : plan.stripePriceIdMonthly;

      const idempotencyKey = `upgrade:${businessId}:${dto.plan}:${dto.billingInterval}:${Date.now()}`;

      await this.stripeService.updateSubscriptionPrice(
        business.stripeSubscriptionId,
        priceId,
        idempotencyKey,
      );

      // Update price ID and billing interval optimistically; webhook confirms plan/features
      await this.businessRepository.updateById(businessId, {
        stripePriceId: priceId,
        billingInterval: dto.billingInterval,
      });

      // Audit trail — webhook will mark success when invoice.payment_succeeded fires
      await this.subscriptionRepository.createTransaction({
        businessId: new Types.ObjectId(businessId),
        type: TransactionType.PLAN_UPGRADED,
        status: TransactionStatus.PENDING,
        plan: dto.plan,
        billingInterval: dto.billingInterval,
        stripeSubscriptionId: business.stripeSubscriptionId,
      });

      return { message: SUBSCRIPTION_MESSAGES.SUCCESS.UPGRADED };
    } catch (err) {
      this.logger.error(
        `upgrade failed [businessId=${businessId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return new InternalServerErrorException(
        'Upgrade failed. Please try again',
      );
    }
  }

  /**
   * Cancels the subscription at the end of the current billing period.
   * The business retains access until the period ends; then status → CANCELED.
   */
  async cancel(
    businessId: string,
  ): Promise<ServiceResponse | NotFoundException> {
    const business = await this.businessRepository.findById(businessId);

    if (!business?.stripeSubscriptionId) {
      return new NotFoundException(SUBSCRIPTION_MESSAGES.ERROR.NO_SUBSCRIPTION);
    }

    const idempotencyKey = `cancel:${businessId}:${Date.now()}`;
    await this.stripeService.cancelSubscription(
      business.stripeSubscriptionId,
      true,
      idempotencyKey,
    );

    // Audit trail
    await this.subscriptionRepository.createTransaction({
      businessId: new Types.ObjectId(businessId),
      type: TransactionType.CANCELED,
      status: TransactionStatus.PENDING,
      plan: business.subscription.plan,
      billingInterval:
        (business.billingInterval as 'monthly' | 'yearly') ?? 'monthly',
      stripeSubscriptionId: business.stripeSubscriptionId,
    });

    return { message: SUBSCRIPTION_MESSAGES.SUCCESS.CANCELED };
  }

  /**
   * Returns the client_secret of the outstanding invoice's PaymentIntent.
   * The frontend confirms payment using Stripe.js; success is confirmed via webhook.
   * Accessible for both GRACE_PERIOD and LOCKED businesses (via @AllowLocked).
   */
  async getPayNowClientSecret(
    businessId: string,
  ): Promise<
    ServiceResponse | NotFoundException | InternalServerErrorException
  > {
    try {
      const business = await this.businessRepository.findById(businessId);

      if (!business?.stripeCustomerId) {
        return new NotFoundException(
          SUBSCRIPTION_MESSAGES.ERROR.NO_STRIPE_CUSTOMER,
        );
      }

      // Prefer the invoice stored at grace period entry — it is always the
      // correct failed invoice. Fall back to listing open invoices for
      // businesses that entered grace period before this field was added.
      const storedInvoiceId = business.subscription.pendingStripeInvoiceId;

      let stripeInvoiceId: string;
      let amountDue: number;
      let currency: string;

      if (storedInvoiceId) {
        stripeInvoiceId = storedInvoiceId;
        amountDue = business.subscription.pendingAmountDue ?? 0;
        currency = business.subscription.pendingCurrency ?? 'usd';
      } else {
        const invoice = await this.stripeService.getLatestOpenInvoice(
          business.stripeCustomerId,
        );
        if (!invoice || invoice.amount_due === 0) {
          return new NotFoundException(
            SUBSCRIPTION_MESSAGES.ERROR.NO_OPEN_INVOICE,
          );
        }
        stripeInvoiceId = invoice.id;
        amountDue = invoice.amount_due;
        currency = invoice.currency;
      }

      const { clientSecret, invoiceId } =
        await this.stripeService.getInvoicePaymentClientSecret(stripeInvoiceId);

      return {
        message: SUBSCRIPTION_MESSAGES.SUCCESS.PAYMENT_INITIATED,
        data: {
          clientSecret,
          invoiceId,
          amountDue,
          currency,
        },
      };
    } catch (err) {
      this.logger.error(
        `getPayNowClientSecret failed [businessId=${businessId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return new InternalServerErrorException(
        SUBSCRIPTION_MESSAGES.ERROR.PAY_NOW_FAILED,
      );
    }
  }

  /** Paginated subscription transaction history for the business. */
  async getTransactions(
    businessId: string,
    dto: PaginationDto,
  ): Promise<ServiceResponse> {
    const { page, limit } = resolvePagination(dto.page, dto.limit);
    const { data, total } =
      await this.subscriptionRepository.findTransactionsByBusiness(
        businessId,
        page,
        limit,
      );

    return {
      message: SUBSCRIPTION_MESSAGES.SUCCESS.TRANSACTIONS_RETRIEVED,
      data,
      meta: buildMeta(page, limit, total),
    };
  }

  /**
   * Returns the business's Stripe customer, creating it on demand. Shares an
   * idempotency key with the async setup job so a race yields one customer.
   */
  private async ensureCustomer(business: Business): Promise<string> {
    if (business.stripeCustomerId) return business.stripeCustomerId;

    const owner = await this.usersRepository.findById(
      business.ownerId.toString(),
    );
    const businessId = business._id.toString();
    const customer = await this.stripeService.createCustomer(
      owner?.email ?? business.email ?? '',
      business.name,
      { businessId },
      stripeCustomerIdempotencyKey(businessId),
    );
    await this.businessRepository.updateById(businessId, {
      stripeCustomerId: customer.id,
    });
    return customer.id;
  }

  /** The plan's Stripe price in the business's local currency (USD fallback). */
  private async resolveLocalPrice(
    business: Business,
    plan: SubscriptionPlan,
    billingInterval: 'monthly' | 'yearly',
  ) {
    const planDoc = await this.subscriptionRepository.findPlanBySlug(plan);
    if (!planDoc) {
      throw new NotFoundException(SUBSCRIPTION_MESSAGES.ERROR.PLAN_NOT_FOUND);
    }

    const priceId =
      billingInterval === 'yearly'
        ? planDoc.stripePriceIdYearly
        : planDoc.stripePriceIdMonthly;
    const currency = business.country
      ? COUNTRY_CONFIG[business.country].currency
      : 'USD';

    try {
      const price = await this.stripeService.getPriceInCurrency(
        priceId,
        currency,
      );
      return { planName: planDoc.name, priceId, price };
    } catch (err) {
      this.logger.error(
        `resolveLocalPrice failed [priceId=${priceId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      throw new ServiceUnavailableException(
        SUBSCRIPTION_MESSAGES.ERROR.PRICE_UNAVAILABLE,
      );
    }
  }
}

const TAX_NOTES: Record<TaxMode, string> = {
  [TaxMode.NONE]: SUBSCRIPTION_MESSAGES.TERMS.TAX_NONE,
  [TaxMode.EXCLUSIVE]: SUBSCRIPTION_MESSAGES.TERMS.TAX_EXCLUSIVE,
  [TaxMode.INCLUSIVE]: SUBSCRIPTION_MESSAGES.TERMS.TAX_INCLUSIVE,
};

export const stripeCustomerIdempotencyKey = (businessId: string) =>
  `customer:${businessId}`;

function trialEndFrom(start: Date): Date {
  const end = new Date(start);
  end.setDate(end.getDate() + TRIAL_PERIOD_DAYS);
  return end;
}

/** Stripe amounts are in minor units; zero-decimal currencies are not used in launch markets. */
function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}
