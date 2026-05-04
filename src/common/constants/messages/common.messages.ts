export const COMMON_MESSAGES = {
  VALIDATION: {
    STRING_INVALID: 'Value must be a valid string',
    FIELD_REQUIRED: 'This field is required',
    PAGE_INTEGER: 'Page must be a whole number',
    PAGE_MIN: 'Page must be greater than or equal to 1',
    LIMIT_INTEGER: 'Limit must be a whole number',
    LIMIT_MIN: 'Limit must be greater than or equal to 1',
    FIELD_MUST_MATCH: (field: string, relatedField: string) =>
      `${field} must match ${relatedField}`,
  },
  ERROR: {
    BAD_REQUEST: 'Invalid or malformed request',
    INTERNAL: 'An unexpected error occurred',
    NOT_FOUND: 'Resource not found',
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'Access denied',
    PAYLOAD_ENCRYPTION_REQUIRED: 'Request payload must be encrypted',
  },
} as const;
