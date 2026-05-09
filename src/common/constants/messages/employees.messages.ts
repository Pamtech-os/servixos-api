export const EMPLOYEES_MESSAGES = {
  VALIDATION: {
    ID_INVALID: 'Employee identifier format is invalid',
    FULL_NAME_REQUIRED: 'Full name is required',
    FULL_NAME_INVALID: 'Full name must be a valid string',
    EMAIL_REQUIRED: 'Email address is required',
    EMAIL_INVALID: 'Email address must be valid',
    PHONE_INVALID: 'Phone number must be a valid string',
    ROLE_ID_REQUIRED: 'Role identifier is required',
    ROLE_ID_INVALID: 'Role identifier format is invalid',
    WEEKLY_TARGET_INVALID: 'Weekly hours target must be a valid number',
    WEEKLY_TARGET_MIN: 'Weekly hours target must be at least 1 hour',
    WEEKLY_TARGET_MAX: 'Weekly hours target cannot exceed 168 hours',
    DATE_JOINED_INVALID: 'Date joined must be a valid ISO date',
    SEARCH_INVALID: 'Search term must be a valid string',
    LIMIT_MAX: 'Limit cannot exceed 50',
    START_DATE_INVALID: 'Start date must be a valid ISO date',
    END_DATE_INVALID: 'End date must be a valid ISO date',
  },
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
    ROLE_NOT_FOUND: 'Role not found',
    USER_LINK_FAILED: 'Unable to process employee account',
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
