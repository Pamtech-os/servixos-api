export const SUBSCRIPTION_MESSAGES = {
  SUCCESS: {
    UPDATED: 'Subscription plan updated successfully',
    RETRIEVED: 'Subscription details retrieved successfully',
  },
  ERROR: {
    PLAN_REQUIRED: (requiredPlan: string) =>
      `This feature requires the ${requiredPlan} plan or higher. Please upgrade your subscription`,
    CLIENT_LIMIT_REACHED: (max: number) =>
      `You have reached the ${max}-client limit for your current plan. Upgrade to add more clients`,
    JOB_LIMIT_REACHED: (max: number) =>
      `You have reached the ${max} jobs/month limit for your current plan. Upgrade to create more jobs`,
    INVOICE_LIMIT_REACHED: (max: number) =>
      `You have reached the ${max} invoices/month limit for your current plan. Upgrade to create more invoices`,
    EMPLOYEE_LIMIT_REACHED: (max: number) =>
      `Your plan supports a maximum of ${max} employee(s). Upgrade to add more team members`,
    PLAN_NOT_FOUND: 'Subscription plan not found',
    DOWNGRADE_CONFLICT:
      'Cannot downgrade: your current usage exceeds the limits of the target plan',
  },
} as const;
