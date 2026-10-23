export const AI_MESSAGES = {
  VALIDATION: {
    CATEGORY_INVALID:
      'Category must be one of: revenue, clients, operations, growth',
    SEVERITY_INVALID: 'Severity must be one of: high, medium, low',
    QUESTION_REQUIRED: 'Question is required',
    QUESTION_INVALID: 'Question must be a valid string',
    QUESTION_TOO_LONG: 'Question must be 500 characters or fewer',
    TOPIC_INVALID: 'Topic must be one of: pricing, marketing, operations',
    SUGGESTION_ID_INVALID: 'Suggestion id must be a valid id',
    DRAFT_VALUE_INVALID: 'Draft value must be a string',
    DRAFT_VALUE_TOO_LONG: 'Draft value must be 5000 characters or fewer',
  },
  SUCCESS: {
    INSIGHTS_GENERATED: 'AI insights generated successfully',
    ADVISOR_RESPONSE: 'AI advisor responded successfully',
    DESCRIPTION_GENERATED: 'Business description generated successfully',
    WEBSITE_GENERATION_STARTED: 'Website generation started',
    SUGGESTIONS_GENERATED: 'AI suggestions generated successfully',
    SUGGESTION_EXECUTED: 'Suggestion executed successfully',
    SUGGESTION_DISMISSED: 'Suggestion dismissed successfully',
    TRACKED_SUGGESTIONS_RETRIEVED: 'Tracked suggestions retrieved successfully',
  },
  ERROR: {
    INSIGHTS_FAILED: 'Unable to generate AI insights at this time',
    ADVISOR_FAILED: 'Unable to process AI advisor request at this time',
    AI_UNAVAILABLE: 'AI service is currently unavailable',
    RATE_LIMITED: 'Too many AI requests. Please wait before trying again',
    SUGGESTIONS_FAILED: 'Unable to generate AI suggestions at this time',
    SUGGESTION_EXECUTE_FAILED:
      'Unable to complete this action right now. Please try again',
    DRAFT_REQUIRED: 'The draft cannot be empty',
    TARGET_AMOUNT_INVALID: 'Target amount must be a positive number',
    PRICE_INCREASE_INVALID:
      'Price increase must be a percentage greater than 0 and at most 100',
    SUGGESTION_NOT_FOUND:
      'This suggestion is no longer available — it may have already been applied, dismissed, or resolved',
  },
} as const;
