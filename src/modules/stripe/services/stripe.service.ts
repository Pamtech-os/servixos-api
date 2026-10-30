import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { TRIAL_PERIOD_DAYS } from 'src/common/constants/subscription-features.constants';

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
    idempotencyKey?: string,
  ) {
    return this.stripe.customers.create(
      { email, name, metadata },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
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
   * Creates a Stripe Subscription with a 7-day free trial.
   * No payment is collected until the trial ends.
   *
   * `cancelIfNoPaymentMethod` makes Stripe cancel (never charge) a trial that
   * ends without a card on file. `currency` selects one of the price's
   * currency options so the customer is billed in their local currency.
   */
  async createSubscription(
    customerId: string,
    priceId: string,
    metadata: Record<string, string>,
    idempotencyKey: string,
    options: SubscriptionOptions = {},
  ) {
    return this.stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: TRIAL_PERIOD_DAYS,
        payment_settings: { save_default_payment_method: 'on_subscription' },
        metadata,
        expand: ['latest_invoice.payment_intent'],
        ...(options.currency && { currency: options.currency.toLowerCase() }),
        ...(options.cancelIfNoPaymentMethod && {
          trial_settings: {
            end_behavior: { missing_payment_method: 'cancel' },
          },
        }),
        ...(options.automaticTax && { automatic_tax: { enabled: true } }),
      },
      { idempotencyKey },
    );
  }

  /**
   * Resolves what a price costs in `currency`, falling back to the price's
   * default currency when no matching currency option is configured in Stripe.
   */
  async getPriceInCurrency(
    priceId: string,
    currency: string,
  ): Promise<{ amount: number; currency: string; interval: string | null }> {
    const price = await this.stripe.prices.retrieve(priceId, {
      expand: ['currency_options'],
    });
    const wanted = currency.toLowerCase();
    const option =
      wanted === price.currency ? null : price.currency_options?.[wanted];

    if (option?.unit_amount != null) {
      return {
        amount: option.unit_amount,
        currency: wanted,
        interval: price.recurring?.interval ?? null,
      };
    }
    if (price.unit_amount == null) {
      throw new Error(`Price ${priceId} has no fixed unit amount`);
    }
    return {
      amount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
    };
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
   *
   * If the invoice has no PaymentIntent yet (card was attached to the customer
   * after the billing attempt, or was never set as the invoice default), we
   * force a payment attempt via invoices.pay(). This creates the PaymentIntent
   * so the frontend can confirm any required 3DS challenge. If the charge
   * succeeds immediately the webhook will unlock the account server-side.
   */
  async getInvoicePaymentClientSecret(
    invoiceId: string,
  ): Promise<{ clientSecret: string; invoiceId: string }> {
    type ExpandedInvoice = {
      id: string;
      payment_intent: { client_secret: string | null } | null;
    };

    let invoice = (await this.stripe.invoices.retrieve(invoiceId, {
      expand: ['payment_intent'],
    })) as unknown as ExpandedInvoice;

    // No PaymentIntent exists — the card on file wasn't the billing default
    // when Stripe first attempted to charge. Force an attempt now so Stripe
    // creates (or resumes) the PaymentIntent against the existing card.
    if (!invoice.payment_intent) {
      await this.stripe.invoices.pay(invoiceId, { off_session: true });
      invoice = (await this.stripe.invoices.retrieve(invoiceId, {
        expand: ['payment_intent'],
      })) as unknown as ExpandedInvoice;
    }

    if (!invoice.payment_intent || !invoice.payment_intent.client_secret) {
      throw new Error(
        `Invoice ${invoiceId} has no collectable PaymentIntent — no payment method on file`,
      );
    }

    return {
      clientSecret: invoice.payment_intent.client_secret,
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

export interface SubscriptionOptions {
  currency?: string;
  cancelIfNoPaymentMethod?: boolean;
  automaticTax?: boolean;
}
