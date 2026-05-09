export const SETTINGS_MESSAGES = {
  SUCCESS: {
    PROFILE_UPDATED: 'Business profile updated successfully',
    PROFILE_RETRIEVED: 'Business profile retrieved successfully',
    PASSWORD_UPDATED: 'Password updated successfully',
    NOTIFICATIONS_UPDATED: 'Notification preferences updated successfully',
    NOTIFICATIONS_RETRIEVED: 'Notification preferences retrieved successfully',
    SUBSCRIPTION_UPDATED: 'Subscription updated successfully',
    ACCOUNT_DELETED: 'Account deleted successfully',
  },
  ERROR: {
    PROFILE_NOT_FOUND: 'Business profile not found',
    ACCOUNT_DELETE_FAILED: 'Unable to delete account at this time',
    INVALID_PASSWORD: 'Incorrect password',
  },
} as const;
