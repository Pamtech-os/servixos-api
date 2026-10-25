export const REVIEWS_MESSAGES = {
  VALIDATION: {
    ID_INVALID: 'Review ID must be a valid Mongo ID',
    JOB_ID_INVALID: 'Job ID must be a valid Mongo ID',
    RATING_INVALID: 'Rating must be a whole number between 1 and 5',
    RATING_MIN: 'Rating must be at least 1',
    RATING_MAX: 'Rating must not exceed 5',
    COMMENT_MAX: 'Comment must not exceed 1000 characters',
    LIMIT_MAX: 'Limit cannot exceed 50',
  },
  SUCCESS: {
    CREATED: 'Review submitted successfully',
    RETRIEVED: 'Reviews retrieved successfully',
    FOUND: 'Review retrieved successfully',
  },
  ERROR: {
    NOT_FOUND: 'Review not found',
    JOB_NOT_FOUND: 'Job not found',
    JOB_NOT_COMPLETED: 'You can only review completed jobs',
    DUPLICATE: 'You have already submitted a review for this job',
  },
} as const;
