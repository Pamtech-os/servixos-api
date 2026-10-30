import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ALLOW_WITHOUT_PAYMENT_METHOD_KEY } from 'src/common/decorators/allow-without-payment-method.decorator';
import { ALLOW_ONBOARDING_KEY } from 'src/common/decorators/allow-onboarding.decorator';
import { PaymentMethodGuard } from 'src/common/guards/payment-method.guard';
import { SubscriptionStatus } from 'src/modules/business/schemas/business.schema';
import { asMock } from 'test/helpers/mock';

function makeContext(status?: SubscriptionStatus): ExecutionContext {
  const business = status ? { subscription: { status } } : undefined;
  return asMock<ExecutionContext>({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () =>
      asMock<ReturnType<ExecutionContext['switchToHttp']>>({
        getRequest: <T>() => ({ business }) as T,
      }),
  });
}

describe('PaymentMethodGuard', () => {
  let guard: PaymentMethodGuard;
  let metadata: Record<string, boolean>;
  let config: Record<string, string>;

  beforeEach(() => {
    metadata = {};
    config = { REQUIRE_PAYMENT_METHOD: 'true' };
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) => metadata[key as string]);
    guard = new PaymentMethodGuard(
      reflector,
      asMock<ConfigService>({ get: jest.fn((key: string) => config[key]) }),
    );
  });

  it('blocks an incomplete business with PAYMENT_METHOD_REQUIRED', () => {
    // Arrange
    const context = makeContext(SubscriptionStatus.INCOMPLETE);

    // Act
    const act = () => guard.canActivate(context);

    // Assert
    expect(act).toThrow(ForbiddenException);
  });

  it('allows a business whose trial has started', () => {
    // Arrange
    const context = makeContext(SubscriptionStatus.TRIALING);

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('allows billing routes marked @AllowWithoutPaymentMethod', () => {
    // Arrange
    metadata[ALLOW_WITHOUT_PAYMENT_METHOD_KEY] = true;
    const context = makeContext(SubscriptionStatus.INCOMPLETE);

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('allows onboarding routes', () => {
    // Arrange
    metadata[ALLOW_ONBOARDING_KEY] = true;
    const context = makeContext(SubscriptionStatus.INCOMPLETE);

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('does nothing while card-before-access is switched off', () => {
    // Arrange
    config.REQUIRE_PAYMENT_METHOD = 'false';
    const context = makeContext(SubscriptionStatus.INCOMPLETE);

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });
});
