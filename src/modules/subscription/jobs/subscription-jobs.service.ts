import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'agenda';
import { Types } from 'mongoose';
import { AgendaService } from '../../agenda/services/agenda.service';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { EmailService } from '../../email/services/email.service';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { StripeService } from '../../stripe/services/stripe.service';
import { JOBS } from 'src/common/constants/agenda.constants';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../business/schemas/business.schema';
import {
  TransactionStatus,
  TransactionType,
} from '../schemas/subscription-transaction.schema';
import { getFeaturesForPlan } from 'src/common/constants/subscription-features.constants';
import { PlanChangeType } from '../../admin/schemas/plan-change.schema';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import { PlanChange } from '../../admin/schemas/plan-change.schema';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

// ─── Email template imports ──────────────────────────────────────────────────
import { subscriptionActivatedTemplate } from '../../email/templates/subscription-activated.template';
import { subscriptionUpgradedTemplate } from '../../email/templates/subscription-upgraded.template';
import { trialEndingTemplate } from '../../email/templates/trial-ending.template';
import { paymentFailedTemplate } from '../../email/templates/payment-failed.template';
import { gracePeriodReminderTemplate } from '../../email/templates/grace-period-reminder.template';
import { accountLockedTemplate } from '../../email/templates/account-locked.template';
import { trialPaymentFailedTemplate } from '../../email/templates/trial-payment-failed.template';
import { actionRequiredTemplate } from '../../email/templates/action-required.template';

// ─── Job data interfaces (exported for type safety) ──────────────────────────

export interface SetupStripeCustomerJobData {
  businessId: string;
  email: string;
  name: string;
  plan: SubscriptionPlan;
  billingInterval: 'monthly' | 'yearly';
}

export interface PaymentSucceededJobData {
  stripeEventId: string;
  customerId: string;
  subscriptionId: string;
  invoiceId: string;
  amountPaid: number;
  currency: string;
  periodEnd: number;
  priceId: string | null;
}

export interface PaymentFailedJobData {
  stripeEventId: string;
  customerId: string;
  subscriptionId: string;
  invoiceId: string;
  amountDue: number;
  currency: string;
}

export interface LockAccountJobData {
  businessId: string;
  businessName: string;
  ownerEmail: string;
  plan: SubscriptionPlan;
}

export interface GracePeriodReminderJobData {
  businessId: string;
  businessName: string;
  ownerEmail: string;
  plan: SubscriptionPlan;
  daysLeft: number;
  amountDue: number;
  currency: string;
}

export interface TrialEndingJobData {
  stripeEventId: string;
  customerId: string;
  trialEnd: number;
}

export interface SubscriptionCanceledJobData {
  stripeEventId: string;
  customerId: string;
  subscriptionId: string;
}

export interface CardSavedJobData {
  stripeEventId: string;
  customerId: string;
  paymentMethodId: string;
}

export interface ActionRequiredJobData {
  stripeEventId: string;
  customerId: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  clientSecret: string;
}

/** Grace period duration in days */
const GRACE_PERIOD_DAYS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionJobsService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionJobsService.name);
  private readonly appUrl: string;
  private readonly mailFrom: string;
  private readonly mailFromName: string;
  private readonly planChangeModel: ReturnModelType<typeof PlanChange>;

  constructor(
    @InjectConnection() connection: Connection,
    private readonly agendaService: AgendaService,
    private readonly businessRepository: BusinessRepository,
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly stripeService: StripeService,
    private readonly emailService: EmailService,
    config: ConfigService,
  ) {
    this.appUrl = config.get<string>('APP_URL') ?? 'http://localhost:3000';
    this.mailFrom =
      config.get<string>('MAIL_FROM_ADDRESS') ?? 'noreply@servixos.com';
    this.mailFromName = config.get<string>('MAIL_FROM_NAME') ?? 'ServixOS';
    this.planChangeModel = getModelForClass(PlanChange, {
      existingConnection: connection,
    });
  }

  onModuleInit(): void {
    this.agendaService.define(JOBS.SUBSCRIPTION_SETUP_STRIPE_CUSTOMER, (job) =>
      this.handleSetupStripeCustomer(job as Job<SetupStripeCustomerJobData>),
    );
    this.agendaService.define(JOBS.SUBSCRIPTION_PAYMENT_SUCCEEDED, (job) =>
      this.handlePaymentSucceeded(job as Job<PaymentSucceededJobData>),
    );
    this.agendaService.define(JOBS.SUBSCRIPTION_PAYMENT_FAILED, (job) =>
      this.handlePaymentFailed(job as Job<PaymentFailedJobData>),
    );
    this.agendaService.define(JOBS.SUBSCRIPTION_LOCK_ACCOUNT, (job) =>
      this.handleLockAccount(job as Job<LockAccountJobData>),
    );
    this.agendaService.define(JOBS.SUBSCRIPTION_GRACE_PERIOD_REMINDER, (job) =>
      this.handleGracePeriodReminder(job as Job<GracePeriodReminderJobData>),
    );
    this.agendaService.define(JOBS.SUBSCRIPTION_TRIAL_ENDING, (job) =>
      this.handleTrialEnding(job as Job<TrialEndingJobData>),
    );
    this.agendaService.define(JOBS.SUBSCRIPTION_CANCELED, (job) =>
      this.handleSubscriptionCanceled(job as Job<SubscriptionCanceledJobData>),
    );
    // Subscription email jobs
    this.agendaService.define(JOBS.EMAIL_SUBSCRIPTION_ACTIVATED, (job) =>
      this.handleEmailSubscriptionActivated(job),
    );
    this.agendaService.define(JOBS.EMAIL_SUBSCRIPTION_UPGRADED, (job) =>
      this.handleEmailSubscriptionUpgraded(job),
    );
    this.agendaService.define(JOBS.EMAIL_TRIAL_ENDING, (job) =>
      this.handleEmailTrialEnding(job),
    );
    this.agendaService.define(JOBS.EMAIL_PAYMENT_FAILED, (job) =>
      this.handleEmailPaymentFailed(job),
    );
    this.agendaService.define(JOBS.EMAIL_GRACE_PERIOD_REMINDER, (job) =>
      this.handleEmailGracePeriodReminder(job),
    );
    this.agendaService.define(JOBS.EMAIL_ACCOUNT_LOCKED, (job) =>
      this.handleEmailAccountLocked(job),
    );
    this.agendaService.define(JOBS.EMAIL_TRIAL_PAYMENT_FAILED, (job) =>
      this.handleEmailTrialPaymentFailed(job),
    );
    this.agendaService.define(JOBS.SUBSCRIPTION_CARD_SAVED, (job) =>
      this.handleCardSaved(job as Job<CardSavedJobData>),
    );
    this.agendaService.define(JOBS.SUBSCRIPTION_ACTION_REQUIRED, (job) =>
      this.handleActionRequired(job as Job<ActionRequiredJobData>),
    );
  }

  // ─── Job handlers ──────────────────────────────────────────────────────────

  /**
   * Creates a Stripe Customer for a newly registered business and creates
   * a Stripe Subscription with a 7-day free trial on the chosen plan.
   */
  private async handleSetupStripeCustomer(
    job: Job<SetupStripeCustomerJobData>,
  ): Promise<void> {
    const { businessId, email, name, plan, billingInterval } = job.attrs.data!;

    try {
      const business = await this.businessRepository.findById(businessId);
      if (!business) {
        this.logger.warn(
          `handleSetupStripeCustomer: business not found [id=${businessId}]`,
        );
        return;
      }

      // Idempotent — if customer already created (e.g. job retried), skip
      if (business.stripeCustomerId) {
        this.logger.log(
          `handleSetupStripeCustomer: customer already exists [id=${businessId}]`,
        );
        return;
      }

      const customer = await this.stripeService.createCustomer(email, name, {
        businessId,
      });

      const planDoc = await this.subscriptionRepository.findPlanBySlug(plan);
      const priceId = planDoc
        ? billingInterval === 'yearly'
          ? planDoc.stripePriceIdYearly
          : planDoc.stripePriceIdMonthly
        : null;

      let stripeSubscriptionId: string | undefined;

      if (priceId) {
        const subscription = await this.stripeService.createSubscription(
          customer.id,
          priceId,
          { businessId },
          `initial-sub:${businessId}`,
        );
        stripeSubscriptionId = subscription.id;
      }

      await this.businessRepository.updateById(businessId, {
        stripeCustomerId: customer.id,
        ...(stripeSubscriptionId && { stripeSubscriptionId }),
        ...(priceId && { stripePriceId: priceId }),
        billingInterval,
      });

      if (stripeSubscriptionId) {
        await this.subscriptionRepository.createTransaction({
          businessId: new Types.ObjectId(businessId),
          type: TransactionType.TRIAL_START,
          status: TransactionStatus.SUCCESS,
          plan,
          billingInterval,
          stripeSubscriptionId,
        });
      }

      this.logger.log(
        `Stripe customer created for business [id=${businessId}]`,
      );
    } catch (err) {
      this.logger.error(
        `handleSetupStripeCustomer failed [businessId=${businessId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      throw err; // Let Agenda retry
    }
  }

  /**
   * Called when Stripe successfully collects payment on an invoice.
   * Transitions business to ACTIVE, updates features, sends success email.
   */
  private async handlePaymentSucceeded(
    job: Job<PaymentSucceededJobData>,
  ): Promise<void> {
    const {
      stripeEventId,
      customerId,
      subscriptionId,
      invoiceId,
      amountPaid,
      currency,
      periodEnd,
      priceId,
    } = job.attrs.data!;

    try {
      const business =
        await this.businessRepository.findByStripeCustomerId(customerId);

      if (!business) {
        this.logger.warn(
          `handlePaymentSucceeded: no business for customer [${customerId}]`,
        );
        return;
      }

      const businessId = business._id.toString();
      const previousPlan = business.subscription.plan;
      const previousStatus = business.subscription.status;

      // Stripe fires invoice.payment_succeeded with amount_paid=0 immediately
      // when a trial subscription is created. Skip activation — the business
      // should stay TRIALING until a real payment is collected.
      if (
        amountPaid === 0 &&
        business.subscription.status === SubscriptionStatus.TRIALING
      ) {
        this.logger.log(
          `handlePaymentSucceeded: skipping $0 trial invoice [businessId=${businessId}]`,
        );
        return;
      }

      // Resolve new plan from the paid invoice's price
      let newPlan = previousPlan;
      if (priceId) {
        const planDoc =
          await this.subscriptionRepository.findPlanByPriceId(priceId);
        if (planDoc) newPlan = planDoc.slug;
      }

      const currentPeriodEnd = new Date(periodEnd * 1000);
      const features = getFeaturesForPlan(newPlan);

      await this.businessRepository.updateById(businessId, {
        'subscription.status': SubscriptionStatus.ACTIVE,
        'subscription.plan': newPlan,
        'subscription.features': features,
        'subscription.currentPeriodEnd': currentPeriodEnd,
        'subscription.gracePeriodEndsAt': null,
        'subscription.trialEndsAt': null,
        'subscription.pendingStripeInvoiceId': null,
        'subscription.pendingAmountDue': null,
        'subscription.pendingCurrency': null,
        stripeSubscriptionId: subscriptionId,
      });

      // Mark all pending transactions for this event as success
      await this.subscriptionRepository.updateTransactionByEventId(
        stripeEventId,
        {
          status: TransactionStatus.SUCCESS,
          amountUsd: amountPaid,
        },
      );

      // Create a fresh success record
      const isUpgrade =
        previousPlan !== newPlan &&
        business.subscription.status === SubscriptionStatus.ACTIVE;

      await this.subscriptionRepository.createTransaction({
        businessId: business._id,
        type: isUpgrade
          ? TransactionType.PLAN_UPGRADED
          : TransactionType.PAYMENT_SUCCEEDED,
        status: TransactionStatus.SUCCESS,
        plan: newPlan,
        billingInterval: this.getBillingInterval(business),
        amountUsd: amountPaid,
        currency,
        stripeEventId,
        stripeSubscriptionId: subscriptionId,
        stripeInvoiceId: invoiceId,
      });

      // Cancel any scheduled lock jobs for this business
      await this.cancelLockJob(businessId);

      // Admin plan-change record
      if (
        previousPlan !== newPlan ||
        previousStatus !== SubscriptionStatus.ACTIVE
      ) {
        const changeType =
          previousStatus === SubscriptionStatus.TRIALING
            ? PlanChangeType.CONVERSION
            : isUpgrade
              ? PlanChangeType.UPGRADE
              : PlanChangeType.CONVERSION;
        await this.recordPlanChange(
          business._id,
          business.name,
          previousPlan,
          newPlan,
          changeType,
        );
      }

      // Determine email type
      const emailJob = isUpgrade
        ? JOBS.EMAIL_SUBSCRIPTION_UPGRADED
        : JOBS.EMAIL_SUBSCRIPTION_ACTIVATED;

      // Fetch owner email
      const updatedBusiness =
        await this.businessRepository.findById(businessId);
      if (updatedBusiness) {
        await this.agendaService.now(emailJob, {
          businessId,
          businessName: updatedBusiness.name,
          plan: newPlan,
          previousPlan,
          ownerEmail: updatedBusiness.email ?? '',
          appUrl: this.appUrl,
        });
      }
    } catch (err) {
      this.logger.error(
        `handlePaymentSucceeded failed [event=${stripeEventId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      throw err;
    }
  }

  /**
   * Called when a Stripe invoice payment fails.
   *
   * - TRIALING → Stripe auto-charged at trial end and the charge failed.
   *   Lock the account immediately — no grace period for trial conversion.
   *   Stripe will still retry; a successful retry fires invoice.payment_succeeded → ACTIVE.
   * - ACTIVE → enter GRACE_PERIOD for 5 days, then lock.
   */
  private async handlePaymentFailed(
    job: Job<PaymentFailedJobData>,
  ): Promise<void> {
    const {
      stripeEventId,
      customerId,
      subscriptionId,
      invoiceId,
      amountDue,
      currency,
    } = job.attrs.data!;

    try {
      const business =
        await this.businessRepository.findByStripeCustomerId(customerId);

      if (!business) {
        this.logger.warn(
          `handlePaymentFailed: no business for customer [${customerId}]`,
        );
        return;
      }

      // Idempotent — skip if already locked (second failure after grace period)
      if (business.subscription.status === SubscriptionStatus.LOCKED) {
        this.logger.log(
          `handlePaymentFailed: business already locked [id=${business._id.toString()}]`,
        );
        return;
      }

      const businessId = business._id.toString();

      // Trial payment failure — lock immediately, no grace period
      if (business.subscription.status === SubscriptionStatus.TRIALING) {
        await this.businessRepository.updateById(businessId, {
          'subscription.status': SubscriptionStatus.LOCKED,
          'subscription.pendingStripeInvoiceId': invoiceId,
          'subscription.pendingAmountDue': amountDue,
          'subscription.pendingCurrency': currency,
        });

        await this.subscriptionRepository.createTransaction({
          businessId: business._id,
          type: TransactionType.PAYMENT_FAILED,
          status: TransactionStatus.FAILED,
          plan: business.subscription.plan,
          billingInterval: this.getBillingInterval(business),
          amountUsd: amountDue,
          currency,
          stripeEventId,
          stripeSubscriptionId: subscriptionId,
          stripeInvoiceId: invoiceId,
        });

        await this.agendaService.now(JOBS.EMAIL_TRIAL_PAYMENT_FAILED, {
          businessName: business.name,
          ownerEmail: business.email ?? '',
          plan: business.subscription.plan,
          amountDue,
          currency,
          appUrl: this.appUrl,
        });

        this.logger.log(
          `Trial expired with failed charge — account locked immediately [businessId=${businessId}]`,
        );
        return;
      }

      // Active subscription renewal failure — enter grace period
      const gracePeriodEndsAt = new Date(
        Date.now() + GRACE_PERIOD_DAYS * MS_PER_DAY,
      );

      await this.businessRepository.updateById(businessId, {
        'subscription.status': SubscriptionStatus.GRACE_PERIOD,
        'subscription.gracePeriodEndsAt': gracePeriodEndsAt,
        'subscription.pendingStripeInvoiceId': invoiceId,
        'subscription.pendingAmountDue': amountDue,
        'subscription.pendingCurrency': currency,
      });

      await this.subscriptionRepository.createTransaction({
        businessId: business._id,
        type: TransactionType.PAYMENT_FAILED,
        status: TransactionStatus.FAILED,
        plan: business.subscription.plan,
        billingInterval: this.getBillingInterval(business),
        amountUsd: amountDue,
        currency,
        stripeEventId,
        stripeSubscriptionId: subscriptionId,
        stripeInvoiceId: invoiceId,
      });

      // Schedule account lock at grace period end
      await this.agendaService.schedule<LockAccountJobData>(
        gracePeriodEndsAt,
        JOBS.SUBSCRIPTION_LOCK_ACCOUNT,
        {
          businessId,
          businessName: business.name,
          ownerEmail: business.email ?? '',
          plan: business.subscription.plan,
        },
      );

      // Send payment failed email immediately
      await this.agendaService.now(JOBS.EMAIL_PAYMENT_FAILED, {
        businessId,
        businessName: business.name,
        ownerEmail: business.email ?? '',
        plan: business.subscription.plan,
        gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
        amountDue,
        currency,
        appUrl: this.appUrl,
      });

      // Schedule daily grace period reminders (days 1–4; day 0 is the payment failed email)
      await this.scheduleGracePeriodReminders(
        businessId,
        business,
        amountDue,
        currency,
      );
    } catch (err) {
      this.logger.error(
        `handlePaymentFailed failed [event=${stripeEventId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      throw err;
    }
  }

  /**
   * Fires at gracePeriodEndsAt. Locks the account if payment still hasn't been made.
   */
  private async handleLockAccount(job: Job<LockAccountJobData>): Promise<void> {
    const { businessId, businessName, ownerEmail, plan } = job.attrs.data!;

    try {
      const business = await this.businessRepository.findById(businessId);
      if (!business) return;

      // Business paid during grace period — nothing to do
      if (business.subscription.status === SubscriptionStatus.ACTIVE) {
        this.logger.log(
          `handleLockAccount: business already active [id=${businessId}]`,
        );
        return;
      }

      await this.businessRepository.updateById(businessId, {
        'subscription.status': SubscriptionStatus.LOCKED,
      });

      await this.subscriptionRepository.createTransaction({
        businessId: business._id,
        type: TransactionType.ACCOUNT_LOCKED,
        status: TransactionStatus.SUCCESS,
        plan,
        billingInterval: this.getBillingInterval(business),
      });

      await this.agendaService.now(JOBS.EMAIL_ACCOUNT_LOCKED, {
        businessName,
        ownerEmail,
        plan,
        appUrl: this.appUrl,
      });

      this.logger.log(`Account locked [businessId=${businessId}]`);
    } catch (err) {
      this.logger.error(
        `handleLockAccount failed [businessId=${businessId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      throw err;
    }
  }

  /** Sends a daily payment reminder during the grace period. Skips if business already paid. */
  private async handleGracePeriodReminder(
    job: Job<GracePeriodReminderJobData>,
  ): Promise<void> {
    const {
      businessId,
      businessName,
      ownerEmail,
      plan,
      daysLeft,
      amountDue,
      currency,
    } = job.attrs.data!;

    const business = await this.businessRepository.findById(businessId);
    if (
      !business ||
      business.subscription.status !== SubscriptionStatus.GRACE_PERIOD
    ) {
      return; // Already paid or locked — skip
    }

    await this.agendaService.now(JOBS.EMAIL_GRACE_PERIOD_REMINDER, {
      businessName,
      ownerEmail,
      plan,
      daysLeft,
      amountDue,
      currency,
      appUrl: this.appUrl,
    });
  }

  /**
   * Fired 3 days before trial ends (from Stripe's `customer.subscription.trial_will_end` event).
   * Also schedules a 1-day-before reminder.
   */
  private async handleTrialEnding(job: Job<TrialEndingJobData>): Promise<void> {
    const { customerId, trialEnd } = job.attrs.data!;

    const business =
      await this.businessRepository.findByStripeCustomerId(customerId);
    if (!business) return;

    const trialEndDate = new Date(trialEnd * 1000);
    const businessId = business._id.toString();

    // 3-day reminder (Stripe fires this event 3 days before trial end)
    await this.agendaService.now(
      JOBS.EMAIL_TRIAL_ENDING,
      this.buildTrialEndingPayload(businessId, business, trialEndDate, 3),
    );

    // 1-day-before reminder
    const oneDayBefore = new Date(trialEndDate.getTime() - MS_PER_DAY);
    if (oneDayBefore > new Date()) {
      await this.agendaService.schedule(
        oneDayBefore,
        JOBS.EMAIL_TRIAL_ENDING,
        this.buildTrialEndingPayload(businessId, business, trialEndDate, 1),
      );
    }
  }

  /** Marks the subscription as CANCELED when Stripe deletes it. */
  private async handleSubscriptionCanceled(
    job: Job<SubscriptionCanceledJobData>,
  ): Promise<void> {
    const { customerId, subscriptionId } = job.attrs.data!;

    const business =
      await this.businessRepository.findByStripeCustomerId(customerId);
    if (!business) return;

    const businessId = business._id.toString();

    await this.businessRepository.updateById(businessId, {
      'subscription.status': SubscriptionStatus.CANCELED,
      stripeSubscriptionId: null,
    });

    await this.subscriptionRepository.createTransaction({
      businessId: business._id,
      type: TransactionType.CANCELED,
      status: TransactionStatus.SUCCESS,
      plan: business.subscription.plan,
      billingInterval: this.getBillingInterval(business),
      stripeSubscriptionId: subscriptionId,
    });

    await this.recordPlanChange(
      business._id,
      business.name,
      business.subscription.plan,
      'none',
      PlanChangeType.CHURN,
    );

    this.logger.log(`Subscription canceled [businessId=${businessId}]`);
  }

  // ─── Email job handlers ───────────────────────────────────────────────────

  private async handleEmailSubscriptionActivated(job: Job): Promise<void> {
    const { ownerEmail, businessName, plan, appUrl } = job.attrs.data as {
      ownerEmail: string;
      businessName: string;
      plan: SubscriptionPlan;
      appUrl: string;
    };
    if (!ownerEmail) return;
    await this.sendEmail(
      ownerEmail,
      `Your ${this.planLabel(plan)} plan is now active!`,
      subscriptionActivatedTemplate(businessName, plan, appUrl),
    );
  }

  private async handleEmailSubscriptionUpgraded(job: Job): Promise<void> {
    const { ownerEmail, businessName, plan, previousPlan, appUrl } = job.attrs
      .data as {
      ownerEmail: string;
      businessName: string;
      plan: SubscriptionPlan;
      previousPlan: SubscriptionPlan;
      appUrl: string;
    };
    if (!ownerEmail) return;
    await this.sendEmail(
      ownerEmail,
      `You've upgraded to ${this.planLabel(plan)}!`,
      subscriptionUpgradedTemplate(businessName, previousPlan, plan, appUrl),
    );
  }

  private async handleEmailTrialEnding(job: Job): Promise<void> {
    const { ownerEmail, businessName, plan, daysLeft, appUrl } = job.attrs
      .data as {
      ownerEmail: string;
      businessName: string;
      plan: SubscriptionPlan;
      daysLeft: number;
      appUrl: string;
    };
    if (!ownerEmail) return;
    await this.sendEmail(
      ownerEmail,
      `Your free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      trialEndingTemplate(businessName, plan, daysLeft, appUrl),
    );
  }

  private async handleEmailPaymentFailed(job: Job): Promise<void> {
    const {
      ownerEmail,
      businessName,
      plan,
      gracePeriodEndsAt,
      amountDue,
      currency,
      appUrl,
    } = job.attrs.data as {
      ownerEmail: string;
      businessName: string;
      plan: SubscriptionPlan;
      gracePeriodEndsAt: string;
      amountDue: number;
      currency: string;
      appUrl: string;
    };
    if (!ownerEmail) return;
    await this.sendEmail(
      ownerEmail,
      `Action required: Payment failed for your ${this.planLabel(plan)} plan`,
      paymentFailedTemplate(
        businessName,
        plan,
        gracePeriodEndsAt,
        amountDue,
        currency,
        appUrl,
      ),
    );
  }

  private async handleEmailGracePeriodReminder(job: Job): Promise<void> {
    const {
      ownerEmail,
      businessName,
      plan,
      daysLeft,
      amountDue,
      currency,
      appUrl,
    } = job.attrs.data as {
      ownerEmail: string;
      businessName: string;
      plan: SubscriptionPlan;
      daysLeft: number;
      amountDue: number;
      currency: string;
      appUrl: string;
    };
    if (!ownerEmail) return;
    await this.sendEmail(
      ownerEmail,
      `Reminder: ${daysLeft} day${daysLeft === 1 ? '' : 's'} left before your account is locked`,
      gracePeriodReminderTemplate(
        businessName,
        plan,
        daysLeft,
        amountDue,
        currency,
        appUrl,
      ),
    );
  }

  private async handleEmailAccountLocked(job: Job): Promise<void> {
    const { ownerEmail, businessName, plan, appUrl } = job.attrs.data as {
      ownerEmail: string;
      businessName: string;
      plan: SubscriptionPlan;
      appUrl: string;
    };
    if (!ownerEmail) return;
    await this.sendEmail(
      ownerEmail,
      `Your ${this.planLabel(plan)} account has been locked`,
      accountLockedTemplate(businessName, plan, appUrl),
    );
  }

  private async handleEmailTrialPaymentFailed(job: Job): Promise<void> {
    const { ownerEmail, businessName, plan, amountDue, currency, appUrl } = job
      .attrs.data as {
      ownerEmail: string;
      businessName: string;
      plan: SubscriptionPlan;
      amountDue: number;
      currency: string;
      appUrl: string;
    };
    if (!ownerEmail) return;
    await this.sendEmail(
      ownerEmail,
      `Your free trial has ended — payment required`,
      trialPaymentFailedTemplate(
        businessName,
        plan,
        amountDue,
        currency,
        appUrl,
      ),
    );
  }

  /**
   * Fires when a SetupIntent succeeds (card successfully saved).
   * Marks the business as having a confirmed payment method so the UI
   * can reflect the "card on file" state without polling Stripe.
   */
  private async handleCardSaved(job: Job<CardSavedJobData>): Promise<void> {
    const { customerId, paymentMethodId } = job.attrs.data!;

    const business =
      await this.businessRepository.findByStripeCustomerId(customerId);
    if (!business) {
      this.logger.warn(
        `handleCardSaved: no business for customer [${customerId}]`,
      );
      return;
    }

    await this.stripeService.attachPaymentMethod(customerId, paymentMethodId);

    await this.businessRepository.updateById(business._id.toString(), {
      'subscription.hasPaymentMethod': true,
    });

    this.logger.log(`Card saved for business [id=${business._id.toString()}]`);
  }

  /**
   * Fires when a payment requires 3DS authentication.
   * Sends an email so the business owner can complete the auth flow from
   * the billing page, preventing accidental account lock.
   */
  private async handleActionRequired(
    job: Job<ActionRequiredJobData>,
  ): Promise<void> {
    const { customerId, amount, currency } = job.attrs.data!;

    const business =
      await this.businessRepository.findByStripeCustomerId(customerId);
    if (!business) {
      this.logger.warn(
        `handleActionRequired: no business for customer [${customerId}]`,
      );
      return;
    }

    if (!business.email) return;

    await this.sendEmail(
      business.email,
      'Action required: complete your payment authentication',
      actionRequiredTemplate(
        business.name,
        business.subscription.plan,
        amount,
        currency,
        this.appUrl,
      ),
    );

    this.logger.log(
      `3DS action-required email sent [business=${business._id.toString()}]`,
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private planLabel(plan: SubscriptionPlan): string {
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  }

  private getBillingInterval(business: {
    billingInterval?: string;
  }): 'monthly' | 'yearly' {
    return (business.billingInterval as 'monthly' | 'yearly') ?? 'monthly';
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    await this.emailService.send({
      from: this.mailFrom,
      name: this.mailFromName,
      to,
      subject,
      html,
    });
  }

  private buildTrialEndingPayload(
    businessId: string,
    business: {
      email?: string;
      name: string;
      subscription: { plan: SubscriptionPlan };
    },
    trialEndDate: Date,
    daysLeft: number,
  ) {
    return {
      businessId,
      ownerEmail: business.email ?? '',
      businessName: business.name,
      plan: business.subscription.plan,
      trialEndsAt: trialEndDate.toISOString(),
      daysLeft,
      appUrl: this.appUrl,
    };
  }

  private async recordPlanChange(
    businessId: Types.ObjectId,
    businessName: string,
    fromPlan: SubscriptionPlan | string,
    toPlan: SubscriptionPlan | string,
    type: PlanChangeType,
  ): Promise<void> {
    await this.planChangeModel.create({
      businessId,
      businessName,
      fromPlan,
      toPlan,
      type,
    });
  }

  private async scheduleGracePeriodReminders(
    businessId: string,
    business: {
      name: string;
      email?: string;
      subscription: { plan: SubscriptionPlan };
    },
    amountDue: number,
    currency: string,
  ): Promise<void> {
    for (let day = 1; day < GRACE_PERIOD_DAYS; day++) {
      await this.agendaService.schedule<GracePeriodReminderJobData>(
        new Date(Date.now() + day * MS_PER_DAY),
        JOBS.SUBSCRIPTION_GRACE_PERIOD_REMINDER,
        {
          businessId,
          businessName: business.name,
          ownerEmail: business.email ?? '',
          plan: business.subscription.plan,
          daysLeft: GRACE_PERIOD_DAYS - day,
          amountDue,
          currency,
        },
      );
    }
  }

  /** Cancels any pending lock-account jobs for a business that has recovered. */
  private async cancelLockJob(businessId: string): Promise<void> {
    try {
      await this.agendaService.cancel({
        name: JOBS.SUBSCRIPTION_LOCK_ACCOUNT,
        'data.businessId': businessId,
      });
    } catch {
      // Non-critical — the lock job self-guards by re-checking status before locking
    }
  }
}
