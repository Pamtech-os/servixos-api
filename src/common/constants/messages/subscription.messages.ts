export const SUBSCRIPTION_MESSAGES = {
  VALIDATION: {
    PLAN_INVALID: 'Invalid subscription plan',
    INTERVAL_INVALID: 'Billing interval must be monthly or yearly',
    PAYMENT_METHOD_INVALID: 'paymentMethodId must be a string',
  },
  SUCCESS: {
    PLANS_RETRIEVED: 'Plans retrieved successfully',
    SETUP_INTENT_CREATED: 'Setup intent created successfully',
    SUBSCRIBED:
      'Subscription created successfully. Your 7-day free trial has started',
    UPGRADED: 'Plan upgraded successfully',
    CANCELED: 'Subscription canceled successfully',
    PAYMENT_INITIATED: 'Payment initiated successfully',
    TRANSACTIONS_RETRIEVED: 'Transaction history retrieved successfully',
    UPDATED: 'Subscription plan updated successfully',
    RETRIEVED: 'Subscription details retrieved successfully',
    QUOTE_RETRIEVED: 'Trial details retrieved successfully',
  },
  TERMS: {
    TRIAL: (days: number) =>
      `Your first ${days} days are free. You won't be charged during the trial.`,
    CANCELLATION: (days: number) =>
      `Cancel any time before your ${days}-day trial ends and you won't be charged. After that, cancelling stops renewal at the end of the current billing period. Manage this from Settings → Subscription.`,
    REMINDER: "We'll email you 3 days and 1 day before your trial ends.",
    TAX_NONE: 'No taxes are added to this price.',
    TAX_EXCLUSIVE:
      'Prices exclude applicable taxes (such as VAT, GST/HST or sales tax), which are calculated from your billing address and added at each charge.',
    TAX_INCLUSIVE: 'Prices include applicable taxes.',
  },
  ERROR: {
    PLAN_NOT_FOUND: 'Subscription plan not found',
    PLAN_REQUIRED: (requiredPlan: string) =>
      `This feature requires the ${requiredPlan} plan or higher. Please upgrade your subscription`,
    ALREADY_SUBSCRIBED:
      'You already have an active subscription. Use the upgrade endpoint to change plans',
    NO_SUBSCRIPTION:
      'No active subscription found. Please subscribe to a plan first',
    NO_STRIPE_CUSTOMER: 'Stripe customer not found. Please contact support',
    PAYMENT_METHOD_REQUIRED:
      'Add a payment method to start your free trial and continue',
    TERMS_NOT_ACCEPTED: 'Please accept the subscription terms to continue',
    TERMS_OUTDATED:
      'The subscription terms have changed. Please review them and try again',
    PRICE_UNAVAILABLE:
      'Pricing is temporarily unavailable. Please try again shortly',
    UPGRADE_NOT_ALLOWED: 'You can only upgrade to a higher-tier plan',
    SAME_PLAN: 'You are already on this plan',
    NO_OPEN_INVOICE: 'No outstanding invoice found',
    PAY_NOW_FAILED:
      'Unable to initiate payment. Please try again or contact support',
    DOWNGRADE_CONFLICT:
      'Cannot downgrade: your current usage exceeds the limits of the target plan',
    CLIENT_LIMIT_REACHED: (max: number) =>
      `You have reached the ${max}-client limit for your current plan. Upgrade to add more clients`,
    JOB_LIMIT_REACHED: (max: number) =>
      `You have reached the ${max} jobs/month limit for your current plan. Upgrade to create more jobs`,
    INVOICE_LIMIT_REACHED: (max: number) =>
      `You have reached the ${max} invoices/month limit for your current plan. Upgrade to create more invoices`,
    EMPLOYEE_LIMIT_REACHED: (max: number) =>
      `Your plan supports a maximum of ${max} employee(s). Upgrade to add more team members`,
  },
} as const;
