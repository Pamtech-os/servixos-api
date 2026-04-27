export const COMMON_MESSAGES = {
  ERROR: {
    BAD_REQUEST: 'Invalid or malformed request',
    INTERNAL: 'An unexpected error occurred',
    NOT_FOUND: 'Resource not found',
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'Access denied',
    PAYLOAD_ENCRYPTION_REQUIRED: 'Request payload must be encrypted',
  },
} as const;
