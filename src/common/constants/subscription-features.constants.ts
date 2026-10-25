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

/** Length of the free trial granted to every new business on signup. */
export const TRIAL_PERIOD_DAYS = 7;

export const FEATURE_PLAN_MAP: Record<string, SubscriptionPlan> = {
  // ── Starter (baseline — all plans inherit these) ───────────────────────────
  'jobs.manage': SubscriptionPlan.STARTER,
  'invoices.manage': SubscriptionPlan.STARTER,
  'clients.manage': SubscriptionPlan.STARTER,
  'ai.business-setup': SubscriptionPlan.STARTER,
  'ai.insights': SubscriptionPlan.STARTER,
  'ai.suggestions': SubscriptionPlan.STARTER,
  'support.center': SubscriptionPlan.STARTER,

  // ── Growth ─────────────────────────────────────────────────────────────────
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

  // AI
  'ai.pricing-assistant': SubscriptionPlan.GROWTH,
  'ai.contract-generator': SubscriptionPlan.GROWTH,

  // Analytics
  'analytics.revenue': SubscriptionPlan.GROWTH,
  'analytics.traffic': SubscriptionPlan.GROWTH,

  // Files & Contracts
  'files.all': SubscriptionPlan.GROWTH,
  'contracts.all': SubscriptionPlan.GROWTH,

  // Activity Logs
  'activity-logs.view': SubscriptionPlan.GROWTH,

  // ── Pro ────────────────────────────────────────────────────────────────────
  'roles.custom': SubscriptionPlan.PRO,
  'website.custom-domain': SubscriptionPlan.PRO,
  'ai.advisor': SubscriptionPlan.PRO,
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
    maxClients: 10,
    maxJobsPerMonth: 10,
    maxInvoicesPerMonth: 10,
    maxEmployees: 0,
    maxAiSuggestions: 5,
    activityLogDays: 0,
  },
  [SubscriptionPlan.GROWTH]: {
    maxClients: 50,
    maxJobsPerMonth: Infinity,
    maxInvoicesPerMonth: 50,
    maxEmployees: 10,
    maxAiSuggestions: 50,
    activityLogDays: 30,
  },
  [SubscriptionPlan.PRO]: {
    maxClients: Infinity,
    maxJobsPerMonth: Infinity,
    maxInvoicesPerMonth: Infinity,
    maxEmployees: Infinity,
    maxAiSuggestions: Infinity,
    activityLogDays: 365,
  },
} as const;
