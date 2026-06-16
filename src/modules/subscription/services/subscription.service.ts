import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { SUBSCRIPTION_MESSAGES } from 'src/common/constants/messages/subscription.messages';
import { PLAN_ORDER } from 'src/common/constants/subscription-features.constants';
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

    if (!business?.stripeCustomerId) {
      throw new NotFoundException(
        SUBSCRIPTION_MESSAGES.ERROR.NO_STRIPE_CUSTOMER,
      );
    }

    const { clientSecret } = await this.stripeService.createSetupIntent(
      business.stripeCustomerId,
    );

    return {
      message: SUBSCRIPTION_MESSAGES.SUCCESS.SETUP_INTENT_CREATED,
      data: { clientSecret },
    };
  }

  /**
   * Creates a Stripe Subscription with a 30-day free trial.
   * Optionally attaches a payment method before creating the subscription.
   */
  async subscribe(
    businessId: string,
    dto: SubscribeDto,
  ): Promise<ServiceResponse> {
    const business = await this.businessRepository.findById(businessId);

    if (!business) throw new NotFoundException('Business not found');

    if (business.stripeSubscriptionId) {
      throw new ConflictException(
        SUBSCRIPTION_MESSAGES.ERROR.ALREADY_SUBSCRIBED,
      );
    }

    if (!business.stripeCustomerId) {
      throw new NotFoundException(
        SUBSCRIPTION_MESSAGES.ERROR.NO_STRIPE_CUSTOMER,
      );
    }

    const plan = await this.subscriptionRepository.findPlanBySlug(dto.plan);
    if (!plan)
      throw new NotFoundException(SUBSCRIPTION_MESSAGES.ERROR.PLAN_NOT_FOUND);

    const priceId =
      dto.billingInterval === 'yearly'
        ? plan.stripePriceIdYearly
        : plan.stripePriceIdMonthly;

    // Attach payment method upfront if provided — ensures seamless trial-to-paid conversion
    if (dto.paymentMethodId) {
      await this.stripeService.attachPaymentMethod(
        business.stripeCustomerId,
        dto.paymentMethodId,
      );
    }

    const idempotencyKey = `subscribe:${businessId}:${dto.plan}:${dto.billingInterval}`;
    const subscription = await this.stripeService.createSubscription(
      business.stripeCustomerId,
      priceId,
      { businessId },
      idempotencyKey,
    );

    const trialEndsAt = new Date((subscription.trial_end ?? 0) * 1000);

    // Persist subscription IDs and billing interval on the business
    await this.businessRepository.updateById(businessId, {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      billingInterval: dto.billingInterval,
      'subscription.plan': dto.plan,
      'subscription.trialEndsAt': trialEndsAt,
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
      data: { trialEndsAt },
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
      if (!business) throw new NotFoundException('Business not found');

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
  ): Promise<ServiceResponse | NotFoundException> {
    const business = await this.businessRepository.findById(businessId);

    if (!business?.stripeCustomerId) {
      return new NotFoundException(
        SUBSCRIPTION_MESSAGES.ERROR.NO_STRIPE_CUSTOMER,
      );
    }

    const invoice = await this.stripeService.getLatestOpenInvoice(
      business.stripeCustomerId,
    );

    if (!invoice) {
      return new NotFoundException(SUBSCRIPTION_MESSAGES.ERROR.NO_OPEN_INVOICE);
    }

    const { clientSecret, invoiceId } =
      await this.stripeService.getInvoicePaymentClientSecret(invoice.id);

    return {
      message: SUBSCRIPTION_MESSAGES.SUCCESS.PAYMENT_INITIATED,
      data: {
        clientSecret,
        invoiceId,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
      },
    };
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
}
