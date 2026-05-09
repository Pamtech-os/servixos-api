export const TIME_TRACKING_MESSAGES = {
  VALIDATION: {
    EMPLOYEE_ID_REQUIRED: 'Employee identifier is required',
    EMPLOYEE_ID_INVALID: 'Employee identifier format is invalid',
    BREAK_DURATION_REQUIRED: 'Break duration is required',
    BREAK_DURATION_INVALID: 'Break duration must be a valid number',
    BREAK_DURATION_MIN: 'Break duration must be at least 1 minute',
    BREAK_DURATION_MAX: 'Break duration cannot exceed 480 minutes',
  },
  SUCCESS: {
    CLOCKED_IN: 'Clocked in successfully',
    CLOCKED_OUT: 'Clocked out successfully',
    BREAK_STARTED: 'Break started',
    BREAK_ENDED: 'Break ended',
    STATUS: 'Clock status retrieved',
  },
  ERROR: {
    ALREADY_CLOCKED_IN: 'Employee is already clocked in',
    NOT_CLOCKED_IN: 'Employee is not currently clocked in',
    ALREADY_ON_BREAK: 'Employee is already on a break',
    NOT_ON_BREAK: 'Employee is not currently on a break',
    EMPLOYEE_NOT_FOUND: 'Employee not found',
    FORBIDDEN_ACTION: 'Access denied',
  },
} as const;
