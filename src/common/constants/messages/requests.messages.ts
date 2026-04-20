export const REQUESTS_MESSAGES = {
  SUCCESS: {
    CREATED: 'Service request submitted successfully',
    RETRIEVED: 'Service requests retrieved successfully',
    FOUND: 'Service request retrieved successfully',
    UPDATED: 'Service request updated successfully',
    ACCEPTED: 'Service request accepted successfully',
    REJECTED: 'Service request rejected',
    CANCELLED: 'Service request cancelled',
    DELETED: 'Service request deleted successfully',
  },
  ERROR: {
    NOT_FOUND: 'Service request not found',
    ALREADY_ACTIONED: 'This request has already been actioned',
  },
} as const;
