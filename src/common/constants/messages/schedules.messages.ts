export const SCHEDULES_MESSAGES = {
  SUCCESS: {
    CREATED: 'Shift created successfully',
    RETRIEVED: 'Schedule retrieved successfully',
    UPDATED: 'Shift updated successfully',
    DELETED: 'Shift deleted successfully',
  },
  ERROR: {
    NOT_FOUND: 'Shift not found',
    CONFLICT: 'Employee already has a shift overlapping this time slot',
  },
} as const;
