export const JOBS_MESSAGES = {
  VALIDATION: {
    CLIENT_ID_REQUIRED: 'Client ID is required',
    CLIENT_ID_INVALID: 'Client ID must be a valid Mongo ID',
    TITLE_REQUIRED: 'Job title is required',
    TITLE_INVALID: 'Job title must be a valid string',
    DESCRIPTION_INVALID: 'Description must be a valid string',
    SCHEDULED_DATE_REQUIRED: 'Scheduled date is required',
    SCHEDULED_DATE_INVALID:
      'Scheduled date must be a valid ISO 8601 date string',
    STATUS_INVALID:
      'Status must be one of pending, in_progress, completed, cancelled',
    LOCATION_INVALID: 'Location must be a valid string',
    PRICE_INVALID: 'Price must be a valid number',
    PRICE_MIN: 'Price cannot be less than zero',
    NOTES_INVALID: 'Notes must be a valid string',
    SEARCH_INVALID: 'Search must be a valid string',
    LIMIT_MAX: 'Limit cannot exceed 50',
    IDS_ARRAY_REQUIRED: 'ids must contain at least one job ID',
    ID_INVALID: 'Each ID must be a valid Mongo ID',
  },
  SUCCESS: {
    CREATED: 'Job created successfully',
    RETRIEVED: 'Jobs retrieved successfully',
    FOUND: 'Job retrieved successfully',
    UPDATED: 'Job updated successfully',
    DELETED: 'Job deleted successfully',
    CONTRACT_GENERATED: 'Contract generated successfully',
    CONTRACT_SENT: 'Contract sent to client successfully',
  },
  ERROR: {
    NOT_FOUND: 'Job not found',
    CLIENT_NOT_FOUND: 'Assigned client not found',
    CONTRACT_NOT_FOUND: 'Contract not found for this job',
    CONTRACT_GEN_FAILED: 'Failed to generate contract PDF',
    CONTRACT_SEND_FAILED: 'Failed to send contract email',
    BULK_DELETE_FAILED: 'Failed to delete selected jobs',
  },
} as const;
