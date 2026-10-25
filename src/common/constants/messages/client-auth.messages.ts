export const CLIENT_AUTH_MESSAGES = {
  VALIDATION: {
    EMAIL_INVALID: 'A valid email address is required',
    PASSWORD_REQUIRED: 'Password is required',
    PASSWORD_INVALID: 'Password must be a valid string',
    PASSWORD_MIN_LENGTH: 'Password must be at least 8 characters',
    PASSWORD_UPPERCASE: 'Password must contain at least one uppercase letter',
    PASSWORD_NUMBER: 'Password must contain at least one number',
    OTP_REQUIRED: 'OTP is required',
    OTP_INVALID: 'OTP must be a valid string',
    REFRESH_TOKEN_REQUIRED: 'Refresh token is required',
    REFRESH_TOKEN_INVALID: 'Refresh token must be a valid string',
  },
  SUCCESS: {
    LOGIN: 'Client login successful',
    TOKEN_REFRESHED: 'Client session refreshed successfully',
    LOGOUT: 'Client logged out successfully',
    PASSWORD_RESET_SENT:
      'If a client account exists, a reset code has been sent',
    PASSWORD_RESET: 'Client password updated successfully',
    PROFILE_RETRIEVED: 'Client profile retrieved successfully',
  },
  ERROR: {
    INVALID_CREDENTIALS: 'Invalid credentials',
    INVALID_TOKEN: 'Invalid or expired token',
    EXPIRED_TOKEN: 'Session has expired. Please log in again',
    UNAUTHORIZED: 'Authentication required',
    PROFILE_NOT_FOUND: 'Client profile not found',
  },
} as const;
