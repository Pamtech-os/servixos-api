import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly stripe: InstanceType<typeof Stripe>;
  private readonly logger = new Logger(StripeService.name);

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(config.get<string>('STRIPE_SECRET_KEY')!, {
      apiVersion: '2026-05-27.dahlia',
    });
  }

  /**
   * Creates a Stripe Customer for a newly onboarded business.
   */
  async createCustomer(
    email: string,
    name: string,
    metadata: Record<string, string>,
  ) {
    return this.stripe.customers.create({ email, name, metadata });
  }

  /**
   * Creates a SetupIntent so the frontend can collect a payment method
   * without charging the customer. The confirmed payment method is
   * automatically attached to the customer.
   */
  async createSetupIntent(
    customerId: string,
  ): Promise<{ clientSecret: string }> {
    const intent = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    });
    return { clientSecret: intent.client_secret! };
  }

  /**
   * Attaches a payment method to a customer and sets it as the default.
   */
  async attachPaymentMethod(
    customerId: string,
    paymentMethodId: string,
  ): Promise<void> {
    await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }

  /**
   * Creates a Stripe Subscription with a 30-day free trial.
   * No payment is collected until the trial ends.
   */
  async createSubscription(
    customerId: string,
    priceId: string,
    metadata: Record<string, string>,
    idempotencyKey: string,
  ) {
    return this.stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: 30,
        payment_settings: { save_default_payment_method: 'on_subscription' },
        metadata,
        expand: ['latest_invoice.payment_intent'],
      },
      { idempotencyKey },
    );
  }

  /**
   * Upgrades or changes the plan on an existing subscription.
   * Uses 'always_invoice' proration so the business is billed immediately
   * for the prorated difference.
   */
  async updateSubscriptionPrice(
    subscriptionId: string,
    newPriceId: string,
    idempotencyKey: string,
  ) {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const itemId = sub.items.data[0]?.id;

    return this.stripe.subscriptions.update(
      subscriptionId,
      {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: 'always_invoice',
      },
      { idempotencyKey },
    );
  }

  /**
   * Cancels a subscription. When atPeriodEnd is true the subscription
   * remains active until the current period ends, then cancels automatically.
   */
  async cancelSubscription(
    subscriptionId: string,
    atPeriodEnd = true,
    idempotencyKey?: string,
  ) {
    return this.stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: atPeriodEnd },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  }

  /**
   * Retrieves the latest open invoice for a subscription.
   * Used when a business wants to pay to restore access.
   */
  async getLatestOpenInvoice(customerId: string) {
    const list = await this.stripe.invoices.list({
      customer: customerId,
      status: 'open',
      limit: 1,
    });
    return list.data[0] ?? null;
  }

  /**
   * Returns the client_secret of the PaymentIntent on an open invoice.
   * The frontend uses this to confirm payment (handles 3DS automatically).
   */
  async getInvoicePaymentClientSecret(
    invoiceId: string,
  ): Promise<{ clientSecret: string; invoiceId: string }> {
    const invoice = (await this.stripe.invoices.retrieve(invoiceId, {
      expand: ['payment_intent'],
    })) as unknown as {
      id: string;
      payment_intent: { client_secret: string | null };
    };
    return {
      clientSecret: invoice.payment_intent.client_secret!,
      invoiceId: invoice.id,
    };
  }

  /**
   * Verifies and parses an incoming Stripe webhook event.
   * Throws if the signature is invalid — caller must return 400.
   */
  constructEvent(rawBody: Buffer, signature: string, secret: string) {
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  /**
   * Retrieves a Stripe Subscription by ID.
   */
  async retrieveSubscription(subscriptionId: string) {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }
}
