import { ConfigService } from '@nestjs/config';
import { StripeService } from 'src/modules/stripe/services/stripe.service';
import { asMock } from 'test/helpers/mock';

describe('StripeService', () => {
  let service: StripeService;
  let prices: { retrieve: jest.Mock };
  let subscriptions: { create: jest.Mock };
  let paymentMethods: { attach: jest.Mock };
  let customers: { update: jest.Mock };

  beforeEach(() => {
    service = new StripeService(
      asMock<ConfigService>({ get: jest.fn().mockReturnValue('sk_test_x') }),
    );
    prices = {
      retrieve: jest.fn().mockResolvedValue({
        currency: 'usd',
        unit_amount: 2900,
        recurring: { interval: 'month' },
        currency_options: { ngn: { unit_amount: 1500000 } },
      }),
    };
    subscriptions = { create: jest.fn().mockResolvedValue({ id: 'sub_1' }) };
    paymentMethods = { attach: jest.fn().mockResolvedValue({ id: 'pm_new' }) };
    customers = { update: jest.fn().mockResolvedValue({}) };
    Reflect.set(service, 'stripe', {
      prices,
      subscriptions,
      paymentMethods,
      customers,
    });
  });

  describe('getPriceInCurrency', () => {
    it('uses the matching currency option', async () => {
      // Arrange
      const currency = 'NGN';

      // Act
      const price = await service.getPriceInCurrency('price_1', currency);

      // Assert
      expect(price).toEqual({
        amount: 1500000,
        currency: 'ngn',
        interval: 'month',
      });
    });

    it('falls back to the default currency when no option exists', async () => {
      // Arrange
      const currency = 'CAD';

      // Act
      const price = await service.getPriceInCurrency('price_1', currency);

      // Assert
      expect(price).toEqual({
        amount: 2900,
        currency: 'usd',
        interval: 'month',
      });
    });
  });

  describe('createSubscription', () => {
    it('cancels a trial that ends without a payment method', async () => {
      // Arrange
      const options = { cancelIfNoPaymentMethod: true, currency: 'GBP' };

      // Act
      await service.createSubscription('cus_1', 'price_1', {}, 'key', options);

      // Assert
      expect(
        (subscriptions.create.mock.calls as unknown[][])[0][0],
      ).toMatchObject({
        trial_period_days: 7,
        currency: 'gbp',
        trial_settings: {
          end_behavior: { missing_payment_method: 'cancel' },
        },
      });
    });

    it('does not enable automatic tax unless asked', async () => {
      // Arrange
      const options = { cancelIfNoPaymentMethod: true };

      // Act
      await service.createSubscription('cus_1', 'price_1', {}, 'key', options);

      // Assert
      expect(
        (subscriptions.create.mock.calls as unknown[][])[0][0],
      ).not.toHaveProperty('automatic_tax');
    });
  });

  describe('attachPaymentMethod', () => {
    it('sets the attached payment method as the invoice default', async () => {
      // Arrange
      const token = 'pm_card_visa';

      // Act
      await service.attachPaymentMethod('cus_1', token);

      // Assert
      expect(customers.update).toHaveBeenCalledWith('cus_1', {
        invoice_settings: { default_payment_method: 'pm_new' },
      });
    });
  });
});
