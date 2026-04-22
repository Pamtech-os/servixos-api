export const API_KEY_MESSAGES = {
  ERROR: {
    MISSING: 'Authentication credentials were not provided',
    INVALID: 'Invalid authentication credentials',
    // Intentionally same as INVALID — do not distinguish expired/revoked from
    // invalid so an attacker cannot confirm a key existed or infer its lifecycle
    EXPIRED: 'Invalid authentication credentials',
    REVOKED: 'Invalid authentication credentials',
    INSUFFICIENT_PERMISSIONS: 'Access denied: insufficient permissions',
    RATE_LIMIT_EXCEEDED: 'Request limit exceeded. Please try again later',
    NOT_FOUND: 'Resource not found',
  },
} as const;
