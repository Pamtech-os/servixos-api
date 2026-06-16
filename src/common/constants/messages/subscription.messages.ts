export const SUBSCRIPTION_MESSAGES = {
  SUCCESS: {
    PLANS_RETRIEVED: 'Plans retrieved successfully',
    SETUP_INTENT_CREATED: 'Setup intent created successfully',
    SUBSCRIBED:
      'Subscription created successfully. Your 30-day free trial has started',
    UPGRADED: 'Plan upgraded successfully',
    CANCELED: 'Subscription canceled successfully',
    PAYMENT_INITIATED: 'Payment initiated successfully',
    TRANSACTIONS_RETRIEVED: 'Transaction history retrieved successfully',
    UPDATED: 'Subscription plan updated successfully',
    RETRIEVED: 'Subscription details retrieved successfully',
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
    UPGRADE_NOT_ALLOWED: 'You can only upgrade to a higher-tier plan',
    SAME_PLAN: 'You are already on this plan',
    NO_OPEN_INVOICE: 'No outstanding invoice found',
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
