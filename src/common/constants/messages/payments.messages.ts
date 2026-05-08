export const PAYMENTS_MESSAGES = {
  VALIDATION: {
    ID_INVALID: 'Payment ID must be a valid Mongo ID',
    INVOICE_ID_INVALID: 'Invoice ID must be a valid Mongo ID',
    CLIENT_ID_INVALID: 'Client ID must be a valid Mongo ID',
    PAYMENT_DATE_INVALID: 'Payment date must be a valid ISO 8601 date string',
    PAYMENT_MODE_INVALID:
      'Payment mode must be one of cash, bank_transfer, credit_card, cheque, mobile_money',
    AMOUNT_INVALID: 'Amount must be a valid number',
    AMOUNT_MIN: 'Amount must be greater than zero',
    STATUS_INVALID: 'Status must be one of completed, partial',
    NOTES_INVALID: 'Notes must be a valid string',
    SEARCH_INVALID: 'Search must be a valid string',
    DATE_FROM_INVALID: 'dateFrom must be a valid ISO 8601 date string',
    DATE_TO_INVALID: 'dateTo must be a valid ISO 8601 date string',
    LIMIT_MAX: 'Limit cannot exceed 50',
  },
  SUCCESS: {
    CREATED: 'Payment recorded successfully',
    RETRIEVED: 'Payments retrieved successfully',
    FOUND: 'Payment retrieved successfully',
    UPDATED: 'Payment updated successfully',
    DELETED: 'Payment deleted successfully',
  },
  ERROR: {
    NOT_FOUND: 'Payment not found',
    INVALID_AMOUNT: 'Payment amount must be greater than zero',
    INVOICE_NOT_FOUND: 'Linked invoice not found',
    OVERPAYMENT_NOT_ALLOWED:
      'Payment amount exceeds the remaining invoice balance',
  },
} as const;
