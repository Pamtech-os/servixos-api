export const WEBSOCKET_MESSAGES = {
  SUCCESS: {
    CONNECTED: 'Connected to chat',
    ROOM_JOINED: 'Joined conversation room',
    ROOM_LEFT: 'Left conversation room',
    MESSAGE_SENT: 'Message sent',
    MARKED_READ: 'Messages marked as read',
  },
  ERROR: {
    // Connection-level (emitted before disconnect)
    MISSING_TOKEN: 'Authentication required',
    INVALID_TOKEN: 'Invalid or expired session',
    // Intentionally generic — do not expose handshake field names
    MISSING_BUSINESS_ID: 'Authentication required',
    TENANT_MISMATCH: 'Access denied',
    BUSINESS_NOT_FOUND: 'Access denied',

    // Event-level (emitted as error event to the socket)
    INVALID_CLIENT_ID: 'Access denied',
    EMPTY_CONTENT: 'Message content cannot be empty',
    CONTENT_TOO_LONG: 'Message content exceeds the allowed limit',
    ROOM_NOT_JOINED: 'You must join the room before sending messages',
    RATE_LIMITED: 'Too many requests. Please slow down',
    INTERNAL: 'An unexpected error occurred',
  },
} as const;
