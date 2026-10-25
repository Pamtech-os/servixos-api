/**
 * Stripe webhook event type strings.
 * Reference: https://docs.stripe.com/api/events/types
 *
 * Only the subset relevant to the subscription lifecycle is listed here.
 * Add entries as new event types are handled — never use inline strings.
 */
export const STRIPE_EVENTS = {
  // ─── Invoice ────────────────────────────────────────────────────────────────
  /** Invoice was paid successfully — transitions TRIALING/GRACE_PERIOD → ACTIVE */
  INVOICE_PAYMENT_SUCCEEDED: 'invoice.payment_succeeded',
  /** Invoice payment attempt failed — begins grace period */
  INVOICE_PAYMENT_FAILED: 'invoice.payment_failed',
  /** Upcoming invoice notification sent ~1 hour before it finalises */
  INVOICE_UPCOMING: 'invoice.upcoming',
  /** Invoice was voided or marked uncollectible */
  INVOICE_VOIDED: 'invoice.voided',

  // ─── Subscription lifecycle ─────────────────────────────────────────────────
  /** New subscription object was created in Stripe */
  SUBSCRIPTION_CREATED: 'customer.subscription.created',
  /** Subscription attributes changed (plan, quantity, status, etc.) */
  SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
  /** Subscription was deleted/cancelled in Stripe — transitions to CANCELED */
  SUBSCRIPTION_DELETED: 'customer.subscription.deleted',
  /** Fired 3 days before trial end — send reminder to add payment method */
  SUBSCRIPTION_TRIAL_WILL_END: 'customer.subscription.trial_will_end',
  /** Subscription was paused (pause_collection) */
  SUBSCRIPTION_PAUSED: 'customer.subscription.paused',
  /** Paused subscription was resumed */
  SUBSCRIPTION_RESUMED: 'customer.subscription.resumed',

  // ─── Payment method / SetupIntent ───────────────────────────────────────────
  /** SetupIntent succeeded — card was successfully saved for future use */
  SETUP_INTENT_SUCCEEDED: 'setup_intent.succeeded',
  /** SetupIntent setup failed */
  SETUP_INTENT_SETUP_FAILED: 'setup_intent.setup_failed',
  /** Payment method was attached to a customer */
  PAYMENT_METHOD_ATTACHED: 'payment_method.attached',
  /** Payment method was detached from a customer */
  PAYMENT_METHOD_DETACHED: 'payment_method.detached',

  // ─── Payment intent ─────────────────────────────────────────────────────────
  /** PaymentIntent requires additional action (e.g. 3DS) */
  PAYMENT_INTENT_REQUIRES_ACTION: 'payment_intent.requires_action',
  /** PaymentIntent payment failed */
  PAYMENT_INTENT_PAYMENT_FAILED: 'payment_intent.payment_failed',
} as const;

export type StripeEventType =
  (typeof STRIPE_EVENTS)[keyof typeof STRIPE_EVENTS];
