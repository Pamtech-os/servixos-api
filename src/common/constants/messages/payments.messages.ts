export const PAYMENTS_MESSAGES = {
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
  },
} as const;
