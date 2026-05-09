export const AI_MESSAGES = {
  SUCCESS: {
    INSIGHTS_GENERATED: 'AI insights generated successfully',
    ADVISOR_RESPONSE: 'AI advisor responded successfully',
    DESCRIPTION_GENERATED: 'Business description generated successfully',
    WEBSITE_GENERATION_STARTED: 'Website generation started',
  },
  ERROR: {
    INSIGHTS_FAILED: 'Unable to generate AI insights at this time',
    ADVISOR_FAILED: 'Unable to process AI advisor request at this time',
    AI_UNAVAILABLE: 'AI service is currently unavailable',
    RATE_LIMITED: 'Too many AI requests. Please wait before trying again',
  },
} as const;
