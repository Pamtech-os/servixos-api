export const WAITLIST_MESSAGES = {
  VALIDATION: {
    FIRST_NAME_REQUIRED: 'First name is required',
    FIRST_NAME_INVALID: 'First name must be a valid string',
    FIRST_NAME_MAX_LENGTH: 'First name must be at most 50 characters',
    EMAIL_REQUIRED: 'Email address is required',
    EMAIL_INVALID: 'Please enter a valid email address',
    EMAIL_MAX_LENGTH: 'Email address must be at most 254 characters',
    PERSONA_REQUIRED: 'Please tell us what best describes you',
    PERSONA_INVALID: 'Please select a valid option for what best describes you',
    DATE_INVALID: 'Date must be a valid ISO 8601 date',
    UNSUBSCRIBE_TOKEN_REQUIRED: 'Unsubscribe token is required',
  },
  SUCCESS: {
    JOINED:
      "You're on the list! We'll keep you updated on ServixOS and let you know when early access becomes available.",
    RETRIEVED: 'Waitlist signups retrieved successfully',
    UNSUBSCRIBED: "You've been unsubscribed and removed from the waitlist.",
  },
  ERROR: {
    ALREADY_REGISTERED: 'This email address is already on the waitlist',
    JOIN_FAILED:
      "We couldn't add you to the waitlist right now. Please try again in a moment.",
    INVALID_UNSUBSCRIBE_TOKEN: 'This unsubscribe link is invalid.',
    UNSUBSCRIBE_FAILED:
      "We couldn't unsubscribe you right now. Please try again in a moment.",
  },
} as const;
