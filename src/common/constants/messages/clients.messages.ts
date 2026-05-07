export const CLIENTS_MESSAGES = {
  SUCCESS: {
    CREATED: 'Client created successfully',
    RETRIEVED: 'Clients retrieved successfully',
    FOUND: 'Client retrieved successfully',
    UPDATED: 'Client updated successfully',
    DELETED: 'Client deleted successfully',
    DATA_EXPORTED: 'Client data exported successfully',
  },
  ERROR: {
    NOT_FOUND: 'Client not found',
    EMAIL_TAKEN: 'Unable to create client with the provided details',
    DELETE_FAILED: 'Failed to delete client',
    EXPORT_FAILED: 'Failed to export client data',
  },
  VALIDATION: {
    NAME_REQUIRED: 'Client name is required',
    NAME_INVALID: 'Client name must be a valid string',
    EMAIL_REQUIRED: 'Client email address is required',
    EMAIL_INVALID: 'Client email address must be a valid email',
    PHONE_INVALID: 'Client phone number must be a valid string',
    LIMIT_MAX: 'Limit cannot exceed 50',
    SEARCH_INVALID: 'Search term must be a valid string',
  },
} as const;
