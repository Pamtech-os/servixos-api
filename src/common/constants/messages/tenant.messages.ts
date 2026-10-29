export const TENANT_MESSAGES = {
  ERROR: {
    MISSING_HEADER: 'Missing required request context',
    INVALID_FORMAT: 'Invalid request context format',
    NOT_FOUND: 'Resource not found',
    // Intentionally generic — do not reveal whether the business is inactive
    // vs non-existent; both resolve to Access denied to prevent state enumeration
    INACTIVE: 'Access denied',
    SUSPENDED: 'Access denied',
    // Intentionally generic — do not reveal token/header structure to callers
    MISMATCH: 'Access denied',
    // Intentionally generic — do not confirm deletion; treat as not found to
    // prevent deleted-account enumeration
    DELETED: 'Resource not found',
    EMPLOYEE_MISMATCH: 'Access denied',
    ONBOARDING_INCOMPLETE: 'Please finish setting up your business to continue',
  },
} as const;
