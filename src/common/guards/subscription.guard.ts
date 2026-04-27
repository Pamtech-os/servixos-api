import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  FEATURE_PLAN_MAP,
  FeatureKey,
  PLAN_ORDER,
} from '../constants/subscription-features.constants';
import { REQUIRE_PLAN_KEY } from '../decorators/require-plan.decorator';
import { SUBSCRIPTION_MESSAGES } from '../constants/messages/subscription.messages';
import { TENANT_MESSAGES } from '../constants/messages/tenant.messages';
import { BusinessRepository } from 'src/modules/business/business.repository';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly businessRepository: BusinessRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<FeatureKey>(
      REQUIRE_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequirePlan() decorator — no plan restriction
    if (!featureKey) return true;

    const { businessId } = context
      .switchToHttp()
      .getRequest<{ user: { businessId: string } }>().user;
    const business = await this.businessRepository.findById(businessId);
    if (!business) throw new NotFoundException(TENANT_MESSAGES.ERROR.NOT_FOUND);

    const requiredPlan = FEATURE_PLAN_MAP[featureKey];
    const currentPlan = business.subscription.plan;

    const hasAccess = PLAN_ORDER[currentPlan] >= PLAN_ORDER[requiredPlan];

    if (!hasAccess) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message: SUBSCRIPTION_MESSAGES.ERROR.PLAN_REQUIRED(requiredPlan),
        currentPlan,
        requiredPlan,
        upgradeUrl: '/settings?tab=subscription',
      });
    }

    return true;
  }
}
