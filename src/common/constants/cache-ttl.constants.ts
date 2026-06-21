export const CACHE_TTL = {
  // Auth
  REFRESH_TOKEN: 60 * 60 * 24 * 7, // 7 days
  PIN_ATTEMPT: 60 * 5, // 5 minutes (rate-limit window)
  PASSWORD_RESET_TOKEN: 60 * 10, // 10 minutes
  EMAIL_OTP: 60 * 10, // 10 minutes

  // Dashboard / Analytics (high-read, low-write)
  DASHBOARD_STATS: 60 * 5, // 5 minutes
  REVENUE_CHART: 60 * 10, // 10 minutes
  JOB_STATUS_CHART: 60 * 5, // 5 minutes
  ANALYTICS_TRAFFIC: 60 * 10, // 10 minutes
  ANALYTICS_TOP_PAGES: 60 * 10, // 10 minutes

  // Business entities (moderate mutation rate)
  CLIENTS_LIST: 60 * 2, // 2 minutes
  CLIENTS_LIST_VERSION: 60 * 60 * 24 * 30, // 30 days (cache-busting version counter)
  CLIENT_DETAIL: 60 * 5, // 5 minutes
  JOBS_LIST: 60 * 2, // 2 minutes
  JOB_DETAIL: 60 * 5, // 5 minutes
  JOBS_LIST_VERSION: 60 * 60 * 24 * 30, // 30 days (cache-busting marker)
  INVOICES_LIST: 60 * 2, // 2 minutes
  INVOICE_DETAIL: 60 * 5, // 5 minutes
  INVOICES_LIST_VERSION: 60 * 60 * 24 * 30, // 30 days (cache-busting version counter)
  PAYMENTS_LIST: 60 * 2, // 2 minutes
  CONTRACTS_LIST: 60 * 5, // 5 minutes
  REQUESTS_LIST: 60 * 2, // 2 minutes
  REQUESTS_LIST_VERSION: 60 * 60 * 24 * 30, // 30 days (cache-busting marker)
  REQUEST_BUSINESS_SLUG: 60, // 1 minute
  REQUEST_CREATE_IDEMPOTENCY_PENDING: 30, // 30 seconds (in-flight create lock)
  REQUEST_CREATE_IDEMPOTENCY_RESULT: 60 * 60 * 24, // 24 hours (dedupe replay window)

  // Team
  EMPLOYEES_LIST: 60 * 5, // 5 minutes
  EMPLOYEES_LIST_VERSION: 60 * 60 * 24 * 30, // 30 days (cache-busting marker)
  EMPLOYEE_DETAIL: 60 * 5, // 5 minutes
  SCHEDULES_WEEK: 60 * 3, // 3 minutes
  CLOCK_STATUS: 30, // 30 seconds (near real-time)
  TASKS_LIST: 60, // 1 minute (kanban refreshes often)

  // Client signing tokens
  CLIENT_TOKEN: 60 * 15, // 15 minutes

  // Reference / quasi-static
  BUSINESS_CATEGORIES: 60 * 60 * 24, // 24 hours (seeded data, changes rarely)
  ROLES_LIST: 60 * 30, // 30 minutes
  PERMISSIONS_LIST: 60 * 60, // 1 hour
  WEBSITE_CONFIG: 60 * 10, // 10 minutes

  // AI Insights (expensive to generate)
  AI_INSIGHTS: 60 * 60, // 1 hour

  // Activity logs (append-only, paginated — short cache)
  ACTIVITY_LOGS: 60, // 1 minute

  // WebSocket / real-time
  WS_PRESENCE: 60 * 30, // 30 minutes (rolling TTL on Redis presence set)
  WS_RATE_LIMIT: 60, // 1 minute window for per-socket rate limiting

  // Multi-tenancy — business existence + active status check
  TENANT_VALIDATION: 60 * 5, // 5 minutes

  // Subscription plan cache (checked on every guarded request)
  SUBSCRIPTION_PLAN: 60 * 5, // 5 minutes

  // Subscription limit counts (max clients, jobs, invoices per month)
  SUBSCRIPTION_LIMIT_COUNT: 60 * 2, // 2 minutes

  // Reviews
  REVIEWS_LIST: 60 * 2, // 2 minutes
  REVIEWS_LIST_VERSION: 60 * 60 * 24 * 30, // 30 days (cache-busting marker)
  REVIEW_STATS: 60 * 5, // 5 minutes
} as const;
