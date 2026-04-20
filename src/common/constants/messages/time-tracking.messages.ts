export const TIME_TRACKING_MESSAGES = {
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
  },
} as const;
