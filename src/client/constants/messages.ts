export const CLIENT_MESSAGES = {
  AUTH: {
    SUCCESS: {
      LOGIN: 'Login successful',
      LOGOUT: 'Logged out successfully',
      TOKEN_REFRESHED: 'Token refreshed successfully',
      OTP_SENT: 'OTP sent to your email address',
      OTP_VERIFIED: 'OTP verified successfully',
      PASSWORD_RESET: 'Password reset successfully',
      PASSWORD_CHANGED: 'Password changed successfully',
    },
    ERROR: {
      INVALID_CREDENTIALS: 'Invalid email or password',
      ACCOUNT_INACTIVE:
        'Your account has been deactivated. Contact your service provider.',
      OTP_INVALID: 'The OTP you entered is incorrect',
      OTP_EXPIRED: 'The OTP has expired. Please request a new one.',
      OTP_ALREADY_USED: 'This OTP has already been used',
      RESET_TOKEN_INVALID: 'Reset token is invalid or has expired',
      SAME_PASSWORD: 'New password must be different from the current password',
      PASSWORD_MISMATCH: 'Passwords do not match',
      CURRENT_PASSWORD_WRONG: 'Current password is incorrect',
    },
  },
  DASHBOARD: {
    SUCCESS: {
      RETRIEVED: 'Dashboard data retrieved successfully',
    },
  },
  INVOICE: {
    SUCCESS: {
      RETRIEVED: 'Invoices retrieved successfully',
      FOUND: 'Invoice retrieved successfully',
    },
    ERROR: {
      NOT_FOUND: 'Invoice not found',
      ACCESS_DENIED: 'You do not have access to this invoice',
    },
  },
  CONTRACT: {
    SUCCESS: {
      RETRIEVED: 'Contracts retrieved successfully',
      FOUND: 'Contract retrieved successfully',
      SIGNED: 'Contract signed successfully',
    },
    ERROR: {
      NOT_FOUND: 'Contract not found',
      ACCESS_DENIED: 'You do not have access to this contract',
      ALREADY_SIGNED: 'This contract has already been signed',
      SIGNATURE_REQUIRED: 'A signature is required to sign this contract',
    },
  },
  FILE: {
    SUCCESS: {
      RETRIEVED: 'Files retrieved successfully',
      DOWNLOAD_URL_READY: 'Download URL generated successfully',
    },
    ERROR: {
      NOT_FOUND: 'File not found',
      ACCESS_DENIED: 'You do not have access to this file',
    },
  },
  MESSAGE: {
    SUCCESS: {
      CONVERSATIONS_RETRIEVED: 'Conversations retrieved successfully',
      MESSAGES_RETRIEVED: 'Messages retrieved successfully',
      MARKED_READ: 'Messages marked as read',
    },
    ERROR: {
      CONVERSATION_NOT_FOUND: 'Conversation not found',
      WS_UNAUTHORIZED: 'Authentication required',
      WS_ROOM_NOT_FOUND:
        'You must join the conversation room before sending messages',
    },
  },
  CONTACT: {
    SUCCESS: {
      RETRIEVED: 'Contacts retrieved successfully',
    },
  },
  ACTIVITY: {
    SUCCESS: {
      RETRIEVED: 'Activities retrieved successfully',
    },
  },
  PROFILE: {
    SUCCESS: {
      RETRIEVED: 'Profile retrieved successfully',
      UPDATED: 'Profile updated successfully',
    },
  },
  VALIDATION: {
    PROVIDER_ID_INVALID: 'Provider ID must be a valid Mongo ID',
    SIGNATURE_INVALID: 'Invalid signature format',
  },
} as const;
