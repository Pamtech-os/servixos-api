export const ACTIVITY_LOGS_MESSAGES = {
  SUCCESS: {
    RETRIEVED: 'Activity logs retrieved successfully',
  },
  ERROR: {
    RETRIEVAL_FAILED: 'Failed to retrieve activity logs',
  },
  VALIDATION: {
    CATEGORY_INVALID: 'Category must be a valid log category',
    DATE_FROM_INVALID: 'dateFrom must be a valid ISO 8601 date string',
    DATE_TO_INVALID: 'dateTo must be a valid ISO 8601 date string',
    LIMIT_MAX: 'Limit cannot exceed 100',
  },
  ACTIONS: {
    AUTH: {
      LOGIN: 'Logged in',
    },
    RESOURCE: {
      CREATED: 'Created',
      UPDATED: 'Updated',
      DELETED: 'Deleted',
      MODIFIED: 'Modified',
    },
  },
} as const;
