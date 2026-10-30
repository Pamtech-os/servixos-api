import { SetMetadata } from '@nestjs/common';

export const ALLOW_ONBOARDING_KEY = 'allowOnboarding';

/**
 * Marks a route as reachable with an ONBOARDING-scoped token (no business yet).
 * Tenant checks are skipped, so the handler must act on `user.sub` only — never `user.businessId`.
 */
export const AllowOnboarding = () => SetMetadata(ALLOW_ONBOARDING_KEY, true);
