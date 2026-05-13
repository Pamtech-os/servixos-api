export enum WsEvent {
  // Client → Server
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  SEND_MESSAGE = 'send_message',
  TYPING_START = 'typing_start',
  TYPING_STOP = 'typing_stop',
  MARK_READ = 'mark_read',
  EDIT_MESSAGE = 'edit_message',
  DELETE_MESSAGE = 'delete_message',

  // Server → Client (client–business conversation)
  CONNECTED = 'connected',
  CONNECTION_ERROR = 'connection_error',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_DELIVERED = 'message_delivered',
  MESSAGE_READ = 'message_read',
  USER_TYPING = 'user_typing',
  USER_STOPPED_TYPING = 'user_stopped_typing',
  USER_ONLINE = 'user_online',
  USER_OFFLINE = 'user_offline',
  ROOM_JOINED = 'room_joined',
  MESSAGE_EDITED = 'message_edited',
  MESSAGE_DELETED = 'message_deleted',
  ERROR = 'error',

  // Server → Client (team channel)
  TEAM_MESSAGE_SENT = 'team_message_sent',
  ANNOUNCEMENT_CREATED = 'announcement_created',
}

/** Business-wide Socket.io room key for team messaging. */
export const teamRoom = (businessId: string): string => `team:${businessId}`;

export interface MessagePayload {
  id: string;
  conversationId: string;
  businessId: string;
  clientId: string;
  sender: string;
  senderName: string;
  content?: string;
  status: string;
  deliveredAt?: string;
  readAt?: string;
  editedAt?: string;
  attachmentUrl?: string;
  publicId?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  createdAt: string;
}
