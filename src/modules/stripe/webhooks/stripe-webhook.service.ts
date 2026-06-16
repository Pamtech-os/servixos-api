import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/services/redis.service';
import { AgendaService } from '../../agenda/services/agenda.service';
import { JOBS } from 'src/common/constants/agenda.constants';
import { STRIPE_EVENTS } from 'src/common/constants/stripe-events.constants';

/** Redis TTL for event deduplication — 48 hours */
const EVENT_TTL_SECONDS = 172800;

interface StripeInvoiceData {
  id: string;
  customer: string | null;
  subscription: string | null;
  amount_paid: number;
  amount_due: number;
  currency: string;
  period_end: number;
  lines?: { data: Array<{ price?: { id: string } | null }> };
}

interface StripeSubscriptionData {
  id: string;
  customer: string | null;
  trial_end: number | null;
}

interface StripeSetupIntentData {
  id: string;
  customer: string | null;
  payment_method: string | null;
}

interface StripePaymentIntentData {
  id: string;
  customer: string | null;
  amount: number;
  currency: string;
  client_secret: string;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly agendaService: AgendaService,
  ) {}

  /**
   * Routes a verified Stripe event to the appropriate Agenda job.
   * Returns immediately after dispatching (webhook must respond with 200 fast).
   * Redis deduplication ensures each event is processed exactly once.
   */
  async handle(event: StripeWebhookEvent): Promise<void> {
    const dedupeKey = `stripe:event:${event.id}`;
    const isNew = await this.redisService.setIfAbsent(
      dedupeKey,
      '1',
      EVENT_TTL_SECONDS,
    );

    if (!isNew) {
      this.logger.log(
        `Duplicate Stripe event ignored: ${event.id} (${event.type})`,
      );
      return;
    }

    this.logger.log(`Processing Stripe event: ${event.id} (${event.type})`);

    switch (event.type) {
      case STRIPE_EVENTS.INVOICE_PAYMENT_SUCCEEDED:
        await this.dispatchPaymentSucceeded(event);
        break;

      case STRIPE_EVENTS.INVOICE_PAYMENT_FAILED:
        await this.dispatchPaymentFailed(event);
        break;

      case STRIPE_EVENTS.SUBSCRIPTION_TRIAL_WILL_END:
        await this.dispatchTrialEnding(event);
        break;

      case STRIPE_EVENTS.SUBSCRIPTION_DELETED:
        await this.dispatchSubscriptionCanceled(event);
        break;

      case STRIPE_EVENTS.SUBSCRIPTION_UPDATED:
        // Handled implicitly via invoice events; logged for observability
        this.logger.log(`Subscription updated: ${event.id}`);
        break;

      case STRIPE_EVENTS.SETUP_INTENT_SUCCEEDED:
        await this.dispatchCardSaved(event);
        break;

      case STRIPE_EVENTS.PAYMENT_INTENT_REQUIRES_ACTION:
        await this.dispatchActionRequired(event);
        break;

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private async dispatchPaymentSucceeded(
    event: StripeWebhookEvent,
  ): Promise<void> {
    const invoice = event.data.object as unknown as StripeInvoiceData;
    await this.agendaService.now(JOBS.SUBSCRIPTION_PAYMENT_SUCCEEDED, {
      stripeEventId: event.id,
      customerId: invoice.customer ?? '',
      subscriptionId: invoice.subscription ?? '',
      invoiceId: invoice.id,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      periodEnd: invoice.period_end,
      priceId: invoice.lines?.data[0]?.price?.id ?? null,
    });
  }

  private async dispatchPaymentFailed(
    event: StripeWebhookEvent,
  ): Promise<void> {
    const invoice = event.data.object as unknown as StripeInvoiceData;
    await this.agendaService.now(JOBS.SUBSCRIPTION_PAYMENT_FAILED, {
      stripeEventId: event.id,
      customerId: invoice.customer ?? '',
      subscriptionId: invoice.subscription ?? '',
      invoiceId: invoice.id,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
    });
  }

  private async dispatchTrialEnding(event: StripeWebhookEvent): Promise<void> {
    const subscription = event.data.object as unknown as StripeSubscriptionData;
    await this.agendaService.now(JOBS.SUBSCRIPTION_TRIAL_ENDING, {
      stripeEventId: event.id,
      customerId: subscription.customer ?? '',
      trialEnd: subscription.trial_end,
    });
  }

  private async dispatchSubscriptionCanceled(
    event: StripeWebhookEvent,
  ): Promise<void> {
    const subscription = event.data.object as unknown as StripeSubscriptionData;
    await this.agendaService.now(JOBS.SUBSCRIPTION_CANCELED, {
      stripeEventId: event.id,
      customerId: subscription.customer ?? '',
      subscriptionId: subscription.id,
    });
  }

  private async dispatchCardSaved(event: StripeWebhookEvent): Promise<void> {
    const intent = event.data.object as unknown as StripeSetupIntentData;
    await this.agendaService.now(JOBS.SUBSCRIPTION_CARD_SAVED, {
      stripeEventId: event.id,
      customerId: intent.customer ?? '',
      paymentMethodId: intent.payment_method ?? '',
    });
  }

  private async dispatchActionRequired(
    event: StripeWebhookEvent,
  ): Promise<void> {
    const pi = event.data.object as unknown as StripePaymentIntentData;
    await this.agendaService.now(JOBS.SUBSCRIPTION_ACTION_REQUIRED, {
      stripeEventId: event.id,
      customerId: pi.customer ?? '',
      paymentIntentId: pi.id,
      amount: pi.amount,
      currency: pi.currency,
      clientSecret: pi.client_secret,
    });
  }
}
