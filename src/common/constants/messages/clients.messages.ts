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
  },
} as const;
