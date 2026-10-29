import type { OnboardingStage } from '../../users/schemas/user.schema';

export interface AuthUserData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Null while the owner is still onboarding (no business yet). */
  businessId: string | null;
  mustChangePassword: boolean;
  subdomain?: string;
  onboardingStage?: OnboardingStage;
}

export interface LoginData {
  accessToken: string;
  refreshToken: string;
  user: AuthUserData;
}

export interface TokenData {
  accessToken: string;
  refreshToken?: string;
}

export enum OnboardingNextStep {
  VERIFY_EMAIL = 'verify_email',
  SET_PIN = 'set_pin',
  BUSINESS_DISCOVERY = 'business_discovery',
  PAYMENT_METHOD = 'payment_method',
  DASHBOARD = 'dashboard',
}

export interface OnboardingStatusData {
  stage: OnboardingStage;
  nextStep: OnboardingNextStep;
  firstName: string;
  email: string;
  country?: string;
  hasPin: boolean;
  businessId: string | null;
  businessRegistration: {
    number: string;
    status: string;
    registeredName?: string;
  } | null;
}
