export const SCHEDULES_MESSAGES = {
  VALIDATION: {
    ID_INVALID: 'Shift ID must be a valid Mongo ID',
    EMPLOYEE_ID_INVALID: 'Employee ID must be a valid Mongo ID',
    SHIFT_DATE_INVALID: 'shiftDate must be a valid ISO 8601 date string',
    WEEK_START_DATE_INVALID:
      'weekStartDate must be a valid ISO 8601 date string',
    START_TIME_INVALID: 'startTime must be in HH:mm format',
    END_TIME_INVALID: 'endTime must be in HH:mm format',
    NOTES_INVALID: 'notes must be a valid string',
  },
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
