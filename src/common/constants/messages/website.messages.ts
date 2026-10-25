export const WEBSITE_MESSAGES = {
  VALIDATION: {
    BOOKING_FORM_TITLE_REQUIRED: 'Booking form title is required',
    BOOKING_FORM_TITLE_INVALID: 'Booking form title must be a string',
    BOOKING_FORM_DESCRIPTION_INVALID:
      'Booking form description must be a string',
    BOOKING_FORM_FIELDS_INVALID: 'Booking form fields must be an array',
    BOOKING_FIELD_KEY_INVALID:
      'Field key must be a valid booking field identifier',
    BOOKING_FIELD_LABEL_REQUIRED: 'Field label is required',
    BOOKING_FIELD_LABEL_INVALID: 'Field label must be a string',
    BOOKING_FIELD_PLACEHOLDER_INVALID: 'Field placeholder must be a string',
    BOOKING_FIELD_REQUIRED_INVALID: 'Field required flag must be a boolean',
  },
  SUCCESS: {
    RETRIEVED: 'Website configuration retrieved successfully',
    UPDATED: 'Website updated successfully',
    PUBLISHED: 'Website published successfully',
    UNPUBLISHED: 'Website unpublished successfully',
    BOOKING_CREATED: 'Booking request submitted successfully',
    BOOKING_FORM_SAVED: 'Booking form saved successfully',
    GENERATED: 'Website generation started',
    DESIGN_SAVED: 'Design settings saved successfully',
    CONTENT_SAVED: 'Website content saved successfully',
    LOGO_SAVED: 'Website logo updated successfully',
  },
  ERROR: {
    NOT_FOUND: 'Website configuration not found',
    PUBLISH_FAILED: 'Unable to publish website at this time',
    INVALID_FIELD: 'Invalid booking form field configuration',
    BOOKING_FAILED: 'Unable to submit booking request at this time',
    LOGO_MISSING: 'No logo file provided',
    INVALID_IMAGE_TYPE: 'Logo must be a JPEG or PNG image',
  },
} as const;
