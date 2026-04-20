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
    SEND_FAILED: 'Failed to send message',
  },
} as const;
