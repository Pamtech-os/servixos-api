import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { RedisService } from 'src/modules/redis/services/redis.service';
import {
  invoicePriceId,
  invoiceServicePeriodEnd,
  invoiceSubscriptionId,
  StripeWebhookService,
  type StripeInvoiceData,
} from 'src/modules/stripe/webhooks/stripe-webhook.service';
import { asMock } from 'test/helpers/mock';

/** Shape captured from a real `invoice.payment_succeeded` (API 2026-07-29.dahlia) during Stage 5. */
const CURRENT_INVOICE: StripeInvoiceData = {
  id: 'in_current',
  customer: 'cus_1',
  amount_paid: 2900,
  amount_due: 2900,
  currency: 'usd',
  period_end: 1793960770,
  parent: { subscription_details: { subscription: 'sub_current' } },
  lines: {
    data: [
      {
        period: { end: 1796552770 },
        pricing: { price_details: { price: 'price_starter' } },
      },
    ],
  },
};

const LEGACY_INVOICE: StripeInvoiceData = {
  id: 'in_legacy',
  customer: 'cus_1',
  amount_paid: 2900,
  amount_due: 2900,
  currency: 'usd',
  period_end: 1700000000,
  subscription: 'sub_legacy',
  lines: { data: [{ price: { id: 'price_legacy' } }] },
};

describe('Stripe invoice field extraction', () => {
  it('reads the subscription from parent.subscription_details', () => {
    // Arrange
    const invoice = CURRENT_INVOICE;

    // Act
    const subscriptionId = invoiceSubscriptionId(invoice);

    // Assert
    expect(subscriptionId).toBe('sub_current');
  });

  it('reads the price from the line pricing details', () => {
    // Arrange
    const invoice = CURRENT_INVOICE;

    // Act
    const priceId = invoicePriceId(invoice);

    // Assert
    expect(priceId).toBe('price_starter');
  });

  it('uses the subscription line period end, not the invoiced period end', () => {
    // Arrange
    const invoice = CURRENT_INVOICE;

    // Act
    const periodEnd = invoiceServicePeriodEnd(invoice);

    // Assert
    expect(periodEnd).toBe(1796552770);
  });

  it('still reads legacy top-level subscription and line price', () => {
    // Arrange
    const invoice = LEGACY_INVOICE;

    // Act
    const extracted = [invoiceSubscriptionId(invoice), invoicePriceId(invoice)];

    // Assert
    expect(extracted).toEqual(['sub_legacy', 'price_legacy']);
  });

  it('accepts expanded objects in place of ids', () => {
    // Arrange
    const invoice: StripeInvoiceData = {
      ...CURRENT_INVOICE,
      parent: { subscription_details: { subscription: { id: 'sub_obj' } } },
    };

    // Act
    const subscriptionId = invoiceSubscriptionId(invoice);

    // Assert
    expect(subscriptionId).toBe('sub_obj');
  });
});

describe('StripeWebhookService.handle', () => {
  it('dispatches payment_succeeded with the fields extracted from a current payload', async () => {
    // Arrange
    const now = jest.fn().mockResolvedValue(undefined);
    const service = new StripeWebhookService(
      asMock<RedisService>({ setIfAbsent: jest.fn().mockResolvedValue(true) }),
      asMock<AgendaService>({ now }),
    );
    jest.spyOn(Reflect.get(service, 'logger'), 'log').mockImplementation();

    // Act
    await service.handle({
      id: 'evt_1',
      type: 'invoice.payment_succeeded',
      data: { object: { ...CURRENT_INVOICE } },
    });

    // Assert
    expect(now).toHaveBeenCalledWith('subscription:payment:succeeded', {
      stripeEventId: 'evt_1',
      customerId: 'cus_1',
      subscriptionId: 'sub_current',
      invoiceId: 'in_current',
      amountPaid: 2900,
      currency: 'usd',
      periodEnd: 1796552770,
      priceId: 'price_starter',
    });
  });
});
