export const ANALYTICS_MESSAGES = {
  VALIDATION: {
    DATE_FROM_INVALID:
      'dateFrom must be a valid ISO 8601 date string (YYYY-MM-DD)',
    DATE_TO_INVALID: 'dateTo must be a valid ISO 8601 date string (YYYY-MM-DD)',
    MONTHS_INTEGER: 'months must be a whole number',
    MONTHS_MIN: 'months must be at least 1',
    MONTHS_MAX: 'months must be at most 24',
  },
  SUCCESS: {
    TRAFFIC_RETRIEVED: 'Traffic analytics retrieved successfully',
    REVENUE_RETRIEVED: 'Revenue data retrieved successfully',
    JOBS_RETRIEVED: 'Jobs analytics retrieved successfully',
    DASHBOARD_RETRIEVED: 'Dashboard statistics retrieved successfully',
  },
  ERROR: {
    RETRIEVAL_FAILED: 'Unable to retrieve analytics data at this time',
  },
} as const;
