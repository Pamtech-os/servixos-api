export const REQUESTS_MESSAGES = {
  VALIDATION: {
    CLIENT_NAME_REQUIRED: 'Client name is required',
    CLIENT_NAME_INVALID: 'Client name must be a valid string',
    CLIENT_EMAIL_REQUIRED: 'Client email is required',
    CLIENT_EMAIL_INVALID: 'A valid client email address is required',
    CLIENT_PHONE_INVALID: 'Client phone must be a valid string',
    SERVICE_REQUIRED: 'Requested service is required',
    SERVICE_INVALID: 'Requested service must be a valid string',
    REQUESTED_DATE_REQUIRED: 'Requested date is required',
    REQUESTED_DATE_INVALID:
      'Requested date must be a valid ISO 8601 date string',
    REQUESTED_DATE_NOT_PAST: 'Requested date must be today or a future date',
    MESSAGE_INVALID: 'Message must be a valid string',
    STATUS_INVALID: 'Status must be one of the allowed request action states',
    SEARCH_INVALID: 'Search term must be a valid string',
    QUOTED_PRICE_INVALID: 'Quoted price must be a valid number',
    QUOTED_PRICE_MIN: 'Quoted price cannot be less than zero',
  },
  SUCCESS: {
    CREATED: 'Service request submitted successfully',
    RETRIEVED: 'Service requests retrieved successfully',
    FOUND: 'Service request retrieved successfully',
    UPDATED: 'Service request updated successfully',
    ACCEPTED: 'Service request accepted successfully',
    REJECTED: 'Service request rejected',
    CANCELLED: 'Service request cancelled',
    DELETED: 'Service request deleted successfully',
  },
  ERROR: {
    NOT_FOUND: 'Service request not found',
    MISSING_BUSINESS_IDENTIFIER:
      'A business identifier is required to submit a service request',
    MULTIPLE_BUSINESS_IDENTIFIERS:
      'Provide either businessId or businessSlug, but not both',
    INVALID_IDEMPOTENCY_KEY:
      'Idempotency key must be between 1 and 128 characters',
    IDEMPOTENCY_IN_PROGRESS:
      'A matching request is already being processed. Please retry shortly.',
    CLIENT_NOT_PROVISIONED:
      'Client profile is not yet available for this request. Please retry shortly.',
    ALREADY_ACTIONED: 'This request has already been actioned',
  },
} as const;
