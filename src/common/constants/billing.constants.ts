/** Bump whenever the subscription terms shown at checkout change; consent is recorded against it. */
export const BILLING_TERMS_VERSION = '2026-10-30';

export enum TaxMode {
  /** No tax is collected yet (current setting). */
  NONE = 'none',
  /** Stripe Tax adds tax on top of the listed price. */
  EXCLUSIVE = 'exclusive',
  /** Listed prices include tax; Stripe Tax backs it out. */
  INCLUSIVE = 'inclusive',
}

export const BILLING_CONFIG_KEYS = {
  REQUIRE_PAYMENT_METHOD: 'REQUIRE_PAYMENT_METHOD',
  TAX_MODE: 'STRIPE_TAX_MODE',
} as const;
