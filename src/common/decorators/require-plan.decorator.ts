import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from '../constants/subscription-features.constants';

export const REQUIRE_PLAN_KEY = 'requirePlan';

/**
 * @RequirePlan('ai.insights')
 * Attach a feature key. The SubscriptionGuard resolves the minimum plan
 * from FEATURE_PLAN_MAP and enforces it.
 */
export const RequirePlan = (featureKey: FeatureKey) =>
  SetMetadata(REQUIRE_PLAN_KEY, featureKey);
