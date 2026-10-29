export const ONBOARDING_MESSAGES = {
  VALIDATION: {
    MESSAGE_REQUIRED: 'Message is required',
    MESSAGE_TOO_LONG: 'Message must be 2000 characters or fewer',
    LIST_INVALID: 'Must be a list',
    LIST_TOO_LONG: 'List has too many items',
    LIST_ITEM_INVALID: 'Each list item must be text of 200 characters or fewer',
    TEXT_INVALID: 'Must be valid text',
    TEXT_TOO_LONG: 'Text is too long',
    NUMBER_INVALID: 'Must be a valid non-negative number',
    COLOR_INVALID: 'Must be a hex colour such as #2563eb',
    CURRENCY_INVALID: 'Currency must be a 3-letter ISO code',
    PRICE_UNIT_INVALID:
      'Price unit must be fixed, hourly, per_visit or monthly',
    SECTION_INVALID: 'Unknown profile section',
  },
  SUCCESS: {
    SESSION_RETRIEVED: 'Onboarding session retrieved',
    SECTION_UPDATED: 'Section updated',
    SECTION_APPROVED: 'Section approved',
  },
  ERROR: {
    BUSINESS_ALREADY_CREATED:
      'Your business is already set up. Continue from your dashboard.',
    SECTION_NOT_FOUND: 'This section has not been drafted yet',
    CHAT_IN_PROGRESS:
      'Please wait for the current reply to finish before sending another message',
    AI_UNAVAILABLE:
      'The assistant is temporarily unavailable. Your progress is saved — please try again shortly.',
    AI_DECLINED:
      "I can't help with that request. Let's keep working on your business — what would you like to do next?",
  },
} as const;
