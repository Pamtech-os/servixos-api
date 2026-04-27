import { SubscriptionPlan } from '../../modules/business/schemas/business.schema';

/**
 * Maps every feature gate key to the MINIMUM plan required to access it.
 * Plans are ordered: starter < growth < pro.
 */
export const PLAN_ORDER: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.STARTER]: 0,
  [SubscriptionPlan.GROWTH]: 1,
  [SubscriptionPlan.PRO]: 2,
};

export const FEATURE_PLAN_MAP: Record<string, SubscriptionPlan> = {
  // Clients
  'clients.export': SubscriptionPlan.GROWTH,
  'clients.messaging': SubscriptionPlan.GROWTH,

  // Jobs
  'jobs.contracts': SubscriptionPlan.GROWTH,

  // Invoices
  'invoices.pdf': SubscriptionPlan.GROWTH,
  'invoices.send': SubscriptionPlan.GROWTH,

  // Team
  'employees.manage': SubscriptionPlan.GROWTH,
  'time-tracking.all': SubscriptionPlan.GROWTH,
  'schedules.all': SubscriptionPlan.GROWTH,
  'tasks.all': SubscriptionPlan.GROWTH,
  'team.messaging': SubscriptionPlan.GROWTH,

  // Analytics
  'analytics.revenue': SubscriptionPlan.GROWTH,
  'analytics.traffic': SubscriptionPlan.GROWTH,

  // Roles
  'roles.custom': SubscriptionPlan.PRO,

  // Website
  'website.custom-domain': SubscriptionPlan.PRO,

  // AI
  'ai.insights': SubscriptionPlan.PRO,
  'ai.advisor': SubscriptionPlan.PRO,

  // Files & Contracts
  'files.all': SubscriptionPlan.GROWTH,
  'contracts.all': SubscriptionPlan.GROWTH,

  // Activity Logs
  'activity-logs.view': SubscriptionPlan.GROWTH,
} as const;

export type FeatureKey = keyof typeof FEATURE_PLAN_MAP;

/**
 * Returns all feature keys accessible at the given plan level.
 * Call this whenever a business's plan is set or changed.
 */
export function getFeaturesForPlan(plan: SubscriptionPlan): FeatureKey[] {
  return Object.entries(FEATURE_PLAN_MAP)
    .filter(([, minPlan]) => PLAN_ORDER[plan] >= PLAN_ORDER[minPlan])
    .map(([feature]) => feature);
}

/**
 * Per-plan hard limits. Enforced in service layer before insert.
 */
export const PLAN_LIMITS = {
  [SubscriptionPlan.STARTER]: {
    maxClients: 25,
    maxJobsPerMonth: 20,
    maxInvoicesPerMonth: 20,
    maxEmployees: 0,
    activityLogDays: 0,
  },
  [SubscriptionPlan.GROWTH]: {
    maxClients: 250,
    maxJobsPerMonth: 200,
    maxInvoicesPerMonth: 200,
    maxEmployees: 10,
    activityLogDays: 30,
  },
  [SubscriptionPlan.PRO]: {
    maxClients: Infinity,
    maxJobsPerMonth: Infinity,
    maxInvoicesPerMonth: Infinity,
    maxEmployees: Infinity,
    activityLogDays: 365,
  },
} as const;
