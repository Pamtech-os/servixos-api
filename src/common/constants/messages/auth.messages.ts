export const AUTH_MESSAGES = {
  SUCCESS: {
    REGISTER: 'Account created successfully',
    ACCOUNT_CREATED:
      'Account created. Check your email for a verification code.',
    EMAIL_VERIFIED: 'Email verified successfully',
    OTP_RESENT: 'A new verification code has been sent to your email',
    PIN_SET: 'PIN set successfully',
    BUSINESS_CREATED: 'Business setup complete',
    LOGIN: 'Login successful',
    LOGOUT: 'Logged out successfully',
    PIN_VERIFIED: 'Verified successfully',
    PASSWORD_RESET_SENT: 'If an account exists, a reset code has been sent',
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
    INVALID_OTP: 'Invalid or expired verification code',
    EMAIL_ALREADY_VERIFIED: 'Email is already verified',
    EMAIL_NOT_VERIFIED: 'Please verify your email before continuing',
    PIN_NOT_SET: 'Please set your PIN before continuing',
    BUSINESS_ALREADY_SETUP: 'Business is already set up',
    SUBDOMAIN_TAKEN:
      'Business name is already taken. Please try a different name.',
    NO_PENDING_VERIFICATION: 'No pending verification found for this email',
    // Intentionally generic — do not confirm whether the email exists
    ACCOUNT_NOT_FOUND: 'Invalid credentials',
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'Access denied',
    INVALID_CURRENT_PASSWORD: 'Current password is incorrect',
  },
} as const;
