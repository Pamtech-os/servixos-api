export const JOBS_MESSAGES = {
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
    CONTRACT_GEN_FAILED: 'Failed to generate contract PDF',
    CONTRACT_SEND_FAILED: 'Failed to send contract email',
    BULK_DELETE_FAILED: 'Failed to delete selected jobs',
  },
} as const;
