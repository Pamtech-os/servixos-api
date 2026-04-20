export const AUTH_MESSAGES = {
  SUCCESS: {
    REGISTER: 'Account created successfully',
    LOGIN: 'Login successful',
    LOGOUT: 'Logged out successfully',
    PIN_VERIFIED: 'Verified successfully',
    PASSWORD_RESET_SENT: 'If an account exists, a reset link has been sent',
    PASSWORD_RESET: 'Password updated successfully',
    TOKEN_REFRESHED: 'Session refreshed successfully',
  },
  ERROR: {
    INVALID_CREDENTIALS: 'Invalid credentials',
    EMAIL_TAKEN: 'Unable to create account with the provided details',
    INVALID_PIN: 'Invalid PIN',
    PIN_LOCKED: 'Account temporarily locked. Try again later',
    EXPIRED_TOKEN: 'Session has expired. Please log in again',
    INVALID_TOKEN: 'Invalid or expired token',
    // Intentionally generic — do not confirm whether the email exists
    ACCOUNT_NOT_FOUND: 'Invalid credentials',
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'Access denied',
    INVALID_CURRENT_PASSWORD: 'Current password is incorrect',
  },
} as const;
