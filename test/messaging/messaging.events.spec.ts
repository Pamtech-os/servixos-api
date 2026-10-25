import {
  WsEvent,
  teamRoom,
  clientPresenceKey,
} from 'src/modules/messaging/messaging.events';

describe('messaging.events', () => {
  describe('teamRoom', () => {
    it('should return the prefixed team room key for a businessId', () => {
      // Arrange
      const businessId = 'biz-001';

      // Act
      const result = teamRoom(businessId);

      // Assert
      expect(result).toBe('team:biz-001');
    });
  });

  describe('clientPresenceKey', () => {
    it('should return the Redis presence key for a businessId', () => {
      // Arrange
      const businessId = 'biz-002';

      // Act
      const result = clientPresenceKey(businessId);

      // Assert
      expect(result).toBe('presence:client:biz-002');
    });
  });

  describe('WsEvent', () => {
    it('should map JOIN_ROOM to join_room', () => {
      expect(WsEvent.JOIN_ROOM).toBe('join_room');
    });

    it('should map LEAVE_ROOM to leave_room', () => {
      expect(WsEvent.LEAVE_ROOM).toBe('leave_room');
    });

    it('should map SEND_MESSAGE to send_message', () => {
      expect(WsEvent.SEND_MESSAGE).toBe('send_message');
    });

    it('should map CONNECTED to connected', () => {
      expect(WsEvent.CONNECTED).toBe('connected');
    });

    it('should map MESSAGE_RECEIVED to message_received', () => {
      expect(WsEvent.MESSAGE_RECEIVED).toBe('message_received');
    });

    it('should map CLIENT_ONLINE to client_online', () => {
      expect(WsEvent.CLIENT_ONLINE).toBe('client_online');
    });

    it('should map CLIENT_OFFLINE to client_offline', () => {
      expect(WsEvent.CLIENT_OFFLINE).toBe('client_offline');
    });

    it('should map TEAM_MESSAGE_SENT to team_message_sent', () => {
      expect(WsEvent.TEAM_MESSAGE_SENT).toBe('team_message_sent');
    });

    it('should map ANNOUNCEMENT_CREATED to announcement_created', () => {
      expect(WsEvent.ANNOUNCEMENT_CREATED).toBe('announcement_created');
    });
  });
});
