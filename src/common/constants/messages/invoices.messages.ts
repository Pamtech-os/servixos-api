export const INVOICES_MESSAGES = {
  VALIDATION: {
    ID_INVALID: 'Invoice ID must be a valid Mongo ID',
    CLIENT_ID_INVALID: 'Client ID must be a valid Mongo ID',
    JOB_ID_INVALID: 'Job ID must be a valid Mongo ID',
    NUMBER_REQUIRED: 'Invoice number is required',
    NUMBER_INVALID: 'Invoice number must be a valid string',
    STATUS_INVALID: 'Status must be one of pending, partial, paid',
    INVOICE_DATE_INVALID: 'Invoice date must be a valid ISO 8601 date string',
    DUE_DATE_INVALID: 'Due date must be a valid ISO 8601 date string',
    LINE_ITEMS_REQUIRED: 'Invoice must contain at least one line item',
    LINE_ITEM_DESC_REQUIRED: 'Line item description is required',
    LINE_ITEM_DESC_INVALID: 'Line item description must be a valid string',
    LINE_ITEM_QTY_INVALID: 'Line item quantity must be a valid number',
    LINE_ITEM_QTY_MIN: 'Line item quantity must be at least 1',
    LINE_ITEM_PRICE_INVALID: 'Line item unit price must be a valid number',
    LINE_ITEM_PRICE_MIN: 'Line item unit price cannot be less than zero',
    TAX_RATE_INVALID: 'Tax rate must be a valid number',
    TAX_RATE_MIN: 'Tax rate cannot be less than zero',
    TAX_RATE_MAX: 'Tax rate cannot exceed 100',
    SEARCH_INVALID: 'Search must be a valid string',
    LIMIT_MAX: 'Limit cannot exceed 50',
  },
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
    CLIENT_NOT_FOUND: 'Assigned client not found',
    PDF_FAILED: 'Unable to generate invoice document at this time',
    SEND_FAILED: 'Unable to send invoice communication at this time',
    NO_LINE_ITEMS: 'Invoice must have at least one line item',
    AUTO_PAYMENT_CREATE_FAILED:
      'Unable to create linked payment record at this time',
    REQUEST_NOT_ACCEPTED:
      'An accepted service request is required before creating an invoice for this client',
    JOB_NOT_FOUND: 'The linked job was not found',
    JOB_CLIENT_MISMATCH: 'The job does not belong to the specified client',
    JOB_AMOUNT_MISMATCH:
      'Invoice would exceed the total uninvoiced amount for this job',
    CONTRACT_REQUIRED:
      'A contract must be generated for this job before creating an invoice.',
    CONTRACT_NOT_SIGNED:
      'The client must sign the contract for this job before creating an invoice.',
  },
} as const;
