export const CONTRACTS_MESSAGES = {
  SUCCESS: {
    CREATED: 'Contract created successfully',
    RETRIEVED: 'Contracts retrieved successfully',
    FOUND: 'Contract retrieved successfully',
    UPDATED: 'Contract updated successfully',
    DELETED: 'Contract deleted successfully',
    PDF_READY: 'Contract PDF generated successfully',
    SENT: 'Contract sent to client successfully',
  },
  ERROR: {
    NOT_FOUND: 'Contract not found',
    PDF_FAILED: 'Failed to generate contract PDF',
    SEND_FAILED: 'Failed to send contract email',
  },
} as const;
