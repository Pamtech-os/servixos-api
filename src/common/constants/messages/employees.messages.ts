export const EMPLOYEES_MESSAGES = {
  SUCCESS: {
    CREATED: 'Employee added successfully',
    RETRIEVED: 'Employees retrieved successfully',
    FOUND: 'Employee retrieved successfully',
    UPDATED: 'Employee updated successfully',
    DELETED: 'Employee removed successfully',
    CLOCK_HISTORY: 'Clock history retrieved successfully',
    ONLINE_LIST: 'Online employees retrieved successfully',
  },
  ERROR: {
    NOT_FOUND: 'Employee not found',
    EMAIL_TAKEN: 'Unable to add employee with the provided details',
  },
  PRESENCE: {
    SUCCESS: {
      CONNECTED: 'Connected to presence channel',
      ONLINE_LIST: 'Online employees retrieved',
      USER_ONLINE: 'Employee came online',
      USER_OFFLINE: 'Employee went offline',
    },
    ERROR: {
      AUTH_FAILED: 'Authentication failed',
      // Intentionally generic — do not expose token fields
      BUSINESS_MISMATCH: 'Access denied',
      REDIS_UNAVAILABLE: 'Service temporarily unavailable',
    },
  },
} as const;
