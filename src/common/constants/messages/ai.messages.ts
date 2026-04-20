export const AI_MESSAGES = {
  SUCCESS: {
    INSIGHTS_GENERATED: 'AI insights generated successfully',
    ADVISOR_RESPONSE: 'AI advisor responded successfully',
    DESCRIPTION_GENERATED: 'Business description generated successfully',
    WEBSITE_GENERATION_STARTED: 'Website generation started',
  },
  ERROR: {
    INSIGHTS_FAILED: 'Failed to generate AI insights',
    ADVISOR_FAILED: 'AI advisor encountered an error',
    AI_UNAVAILABLE: 'AI service is currently unavailable',
    RATE_LIMITED: 'Too many AI requests. Please wait before trying again',
  },
} as const;
