export const API_KEY_MESSAGES = {
  ERROR: {
    MISSING: 'Authentication credentials were not provided',
    INVALID: 'Invalid authentication credentials',
    EXPIRED: 'Invalid authentication credentials',
    REVOKED: 'Invalid authentication credentials',
    INSUFFICIENT_PERMISSIONS: 'Access denied: insufficient permissions',
    RATE_LIMIT_EXCEEDED: 'Request limit exceeded. Please try again later',
    NOT_FOUND: 'Resource not found',
  },
  SUCCESS: {
    CLIENT_TOKEN_ISSUED: 'Client token issued successfully',
  },
} as const;
