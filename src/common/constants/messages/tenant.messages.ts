export const TENANT_MESSAGES = {
  ERROR: {
    MISSING_HEADER: 'Missing required request context',
    INVALID_FORMAT: 'Invalid request context format',
    NOT_FOUND: 'Resource not found',
    INACTIVE: 'This account has been deactivated',
    // Intentionally generic — do not reveal token/header structure to callers
    MISMATCH: 'Access denied',
    DELETED: 'This account no longer exists',
    EMPLOYEE_MISMATCH: 'Access denied',
  },
} as const;
