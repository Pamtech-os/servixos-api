export const MESSAGING_MESSAGES = {
  SUCCESS: {
    MESSAGE_SENT: 'Message sent successfully',
    MESSAGES_RETRIEVED: 'Messages retrieved successfully',
    ANNOUNCEMENT_CREATED: 'Announcement created successfully',
    ANNOUNCEMENTS_RETRIEVED: 'Announcements retrieved successfully',
    TEAM_MESSAGE_SENT: 'Team message sent successfully',
  },
  ERROR: {
    CLIENT_NOT_FOUND: 'Client not found for messaging',
    SEND_FAILED: 'Unable to process message request at this time',
    ATTACHMENT_TOO_LARGE: 'Attachment size exceeds the allowed limit',
    ATTACHMENT_TYPE_INVALID: 'Attachment file type is not allowed',
    ATTACHMENT_UPLOAD_FAILED: 'Unable to upload attachment at this time',
  },
} as const;
