export const INVOICES_MESSAGES = {
  SUCCESS: {
    CREATED: 'Invoice created successfully',
    RETRIEVED: 'Invoices retrieved successfully',
    FOUND: 'Invoice retrieved successfully',
    UPDATED: 'Invoice updated successfully',
    DELETED: 'Invoice deleted successfully',
    PDF_READY: 'Invoice PDF generated successfully',
    SENT: 'Invoice sent to client successfully',
  },
  ERROR: {
    NOT_FOUND: 'Invoice not found',
    NUMBER_TAKEN: 'Invoice number already exists',
    PDF_FAILED: 'Failed to generate invoice PDF',
    SEND_FAILED: 'Failed to send invoice email',
    NO_LINE_ITEMS: 'Invoice must have at least one line item',
  },
} as const;
