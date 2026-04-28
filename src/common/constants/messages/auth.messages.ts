export const AUTH_MESSAGES = {
  VALIDATION: {
    FIRST_NAME_REQUIRED: 'First name is required',
    LAST_NAME_REQUIRED: 'Last name is required',
    EMAIL_INVALID: 'A valid email address is required',
    PHONE_INVALID: 'Phone must be a valid international phone number',
    PASSWORD_MIN_LENGTH: 'Password must be at least 8 characters',
    PASSWORD_UPPERCASE: 'Password must contain at least one uppercase letter',
    PASSWORD_NUMBER: 'Password must contain at least one number',
    PASSWORDS_MISMATCH: 'Passwords do not match',
    OTP_LENGTH: 'OTP must be exactly 6 digits',
    PIN_FORMAT: 'PIN must be exactly 4 digits',
    PINS_MISMATCH: 'PINs do not match',
    REFRESH_TOKEN_REQUIRED: 'Refresh token is required',
    BUSINESS_NAME_REQUIRED: 'Business name is required',
    BUSINESS_CATEGORY_INVALID: 'businessCategory must be a valid category ID',
    BUSINESS_DESCRIPTION_REQUIRED: 'Business description is required',
    BUSINESS_DESCRIPTION_RESTRICTED:
      'Business description does not meet our content policy. Please provide a professional description of your business.',
    TIMEZONE_REQUIRED: 'Timezone is required',
    TIMEZONE_INVALID:
      'Timezone must be a valid IANA timezone (e.g. Africa/Lagos)',
  },
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
    PIN_LOCKED: 'Too many attempts. Please try again later',
    EXPIRED_TOKEN: 'Session has expired. Please log in again',
    INVALID_TOKEN: 'Invalid or expired token',
    INVALID_OTP: 'Invalid or expired verification code',
    // Intentionally neutral — do not confirm email state to unauthenticated callers
    EMAIL_ALREADY_VERIFIED: 'No action required',
    EMAIL_NOT_VERIFIED: 'Please verify your email before continuing',
    PIN_NOT_SET: 'Please set your PIN before continuing',
    BUSINESS_ALREADY_SETUP: 'Business is already set up',
    SUBDOMAIN_TAKEN:
      'Business name is already taken. Please try a different name.',
    // Intentionally generic — do not reveal whether the email is registered
    NO_PENDING_VERIFICATION: 'Unable to process verification request',
    // Intentionally generic — do not confirm whether the email exists
    ACCOUNT_NOT_FOUND: 'Invalid credentials',
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'Access denied',
    INVALID_CURRENT_PASSWORD: 'Current password is incorrect',
  },
} as const;
