export const WEBSITE_MESSAGES = {
  SUCCESS: {
    RETRIEVED: 'Website configuration retrieved successfully',
    UPDATED: 'Website updated successfully',
    PUBLISHED: 'Website published successfully',
    UNPUBLISHED: 'Website unpublished successfully',
    BOOKING_CREATED: 'Booking request submitted successfully',
    GENERATED: 'Website generation started',
  },
  ERROR: {
    NOT_FOUND: 'Website configuration not found',
    PUBLISH_FAILED: 'Failed to publish website',
    INVALID_FIELD: 'Invalid booking form field configuration',
    BOOKING_FAILED: 'Failed to submit booking request',
  },
} as const;
