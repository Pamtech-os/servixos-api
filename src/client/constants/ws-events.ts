export const MESSAGE_EVENTS = {
  CONNECTED: 'connected',
  JOIN_CONVERSATION: 'join_conversation',
  LEAVE_CONVERSATION: 'leave_conversation',
  SEND_MESSAGE: 'send_message',
  MARK_READ: 'mark_read',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  NEW_MESSAGE: 'new_message',
  MESSAGE_READ: 'message_read',
  CONVERSATION_UPDATED: 'conversation_updated',
  TYPING: 'typing',
  ERROR: 'error',
} as const;
