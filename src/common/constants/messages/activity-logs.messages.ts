export const ACTIVITY_LOGS_MESSAGES = {
  SUCCESS: {
    RETRIEVED: 'Activity logs retrieved successfully',
  },
  ERROR: {
    RETRIEVAL_FAILED: 'Unable to retrieve activity logs at this time',
  },
  VALIDATION: {
    CATEGORY_INVALID: 'Category must be a valid log category',
    DATE_FROM_INVALID: 'dateFrom must be a valid ISO 8601 date string',
    DATE_TO_INVALID: 'dateTo must be a valid ISO 8601 date string',
    LIMIT_MAX: 'Limit cannot exceed 100',
  },
  ACTIONS: {
    AUTH: {
      LOGIN: 'Logged in',
    },
    RESOURCE: {
      CREATED: 'Created',
      UPDATED: 'Updated',
      DELETED: 'Deleted',
      MODIFIED: 'Modified',
    },
    CLIENT: {
      ADDED: (name: string) => `New client ${name} added`,
      UPDATED: (name: string) => `Client ${name} updated`,
      DELETED: (name: string) => `Client ${name} deleted`,
    },
    INVOICE: {
      CREATED: (num: string) => `Invoice ${num} created`,
      MARKED_PAID: (num: string) => `Invoice ${num} marked as paid`,
      PARTIAL_PAID: (num: string) => `Invoice ${num} partially paid`,
      UPDATED: (num: string) => `Invoice ${num} updated`,
      DELETED: (num: string) => `Invoice ${num} deleted`,
    },
    JOB: {
      CREATED: (title: string) => `Job '${title}' created`,
      STATUS_UPDATED: (title: string, status: string) =>
        `Job '${title}' status updated to ${status}`,
      UPDATED: (title: string) => `Job '${title}' updated`,
      DELETED: (title: string) => `Job '${title}' deleted`,
    },
    PAYMENT: {
      RECORDED: (amount: string) => `Payment of ${amount} recorded`,
      DELETED: (amount: string) => `Payment of ${amount} deleted`,
    },
    EMPLOYEE: {
      INVITED: (name: string) => `Employee ${name} invited`,
      UPDATED: (name: string) => `Employee ${name} updated`,
      DEACTIVATED: (name: string) => `Employee ${name} deactivated`,
    },
    TASK: {
      CREATED: (title: string) => `Task '${title}' created`,
      UPDATED: (title: string) => `Task '${title}' updated`,
      DELETED: (title: string) => `Task '${title}' deleted`,
    },
    REQUEST: {
      ACCEPTED: 'Service request accepted',
      REJECTED: 'Service request rejected',
      CANCELLED: 'Service request cancelled',
      CREATED: 'Service request created',
    },
  },
} as const;
