import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_ONBOARDING_KEY } from '../decorators/allow-onboarding.decorator';
import { ALLOW_WITHOUT_PAYMENT_METHOD_KEY } from '../decorators/allow-without-payment-method.decorator';
import { SUBSCRIPTION_MESSAGES } from '../constants/messages/subscription.messages';
import { isPaymentMethodRequired } from '../utils/billing.util';
import {
  Business,
  SubscriptionStatus,
} from 'src/modules/business/schemas/business.schema';

export const PAYMENT_METHOD_REQUIRED_CODE = 'PAYMENT_METHOD_REQUIRED';

/**
 * Blocks a business that has not yet added a card and started its trial
 * (status INCOMPLETE) from everything except billing and the dashboard shell.
 * Runs after TenantGuard, which attaches the validated business to the request.
 */
@Injectable()
export class PaymentMethodGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!isPaymentMethodRequired(this.config)) return true;

    const exempt = [
      IS_PUBLIC_KEY,
      ALLOW_ONBOARDING_KEY,
      ALLOW_WITHOUT_PAYMENT_METHOD_KEY,
    ].some((key) =>
      this.reflector.getAllAndOverride<boolean>(key, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
    if (exempt) return true;

    const business = context
      .switchToHttp()
      .getRequest<Request & { business?: Business }>().business;

    if (business?.subscription.status === SubscriptionStatus.INCOMPLETE) {
      throw new ForbiddenException({
        code: PAYMENT_METHOD_REQUIRED_CODE,
        message: SUBSCRIPTION_MESSAGES.ERROR.PAYMENT_METHOD_REQUIRED,
      });
    }
    return true;
  }
}
