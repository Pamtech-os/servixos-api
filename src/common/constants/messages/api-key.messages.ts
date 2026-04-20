export const API_KEY_MESSAGES = {
  ERROR: {
    MISSING: 'Authentication credentials were not provided',
    INVALID: 'Invalid authentication credentials',
    EXPIRED: 'Authentication credentials have expired',
    REVOKED: 'Authentication credentials are no longer valid',
    INSUFFICIENT_PERMISSIONS: 'Access denied: insufficient permissions',
    RATE_LIMIT_EXCEEDED: 'Request limit exceeded. Please try again later',
    NOT_FOUND: 'Resource not found',
  },
} as const;
