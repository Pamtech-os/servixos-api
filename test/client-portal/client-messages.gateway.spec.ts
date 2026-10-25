import { HttpException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { asMock } from 'test/helpers/mock';
import { MESSAGE_EVENTS } from 'src/client/constants/ws-events';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { ClientMessagesService } from 'src/modules/client-portal/services/client-messages.service';
import { WsJwtClientAuthGuard } from 'src/modules/client-portal/guards/ws-jwt-client-auth.guard';
import type { AuthenticatedSocket } from 'src/modules/client-portal/interfaces/authenticated-socket.interface';
import {
  ClientMessagesGateway,
  buildRoomId,
} from 'src/modules/client-portal/gateways/client-messages.gateway';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const clientId = new Types.ObjectId().toString();
const businessId = new Types.ObjectId().toString();
const providerId = businessId;

function makeSocket(overrides: Partial<Record<string, unknown>> = {}) {
  const rooms = new Set<string>();
  const data: Record<string, unknown> = { clientId, businessId, ...overrides };
  return {
    id: 'socket-client-1',
    data,
    rooms,
    join: jest.fn().mockImplementation((room: string) => {
      rooms.add(room);
    }),
    leave: jest.fn().mockImplementation((room: string) => {
      rooms.delete(room);
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  };
}

type MockSocket = ReturnType<typeof makeSocket>;
const asSocket = (s: MockSocket): AuthenticatedSocket =>
  s as unknown as AuthenticatedSocket;

function makeServerMock() {
  const emitFn = jest.fn();
  const toFn = jest.fn().mockReturnValue({ emit: emitFn });
  const ofFn = jest.fn().mockReturnValue({ to: toFn });
  return { to: toFn, of: ofFn, emit: emitFn };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('ClientMessagesGateway', () => {
  let gateway: ClientMessagesGateway;
  let mockServer: ReturnType<typeof makeServerMock>;

  let messagesService: {
    sendMessage: jest.Mock;
    getConversationSummary: jest.Mock;
    markConversationAsRead: jest.Mock;
  };
  let authGuard: { authenticate: jest.Mock };
  let redis: {
    sadd: jest.Mock;
    expire: jest.Mock;
    srem: jest.Mock;
  };

  beforeEach(() => {
    messagesService = {
      sendMessage: jest.fn(),
      getConversationSummary: jest.fn().mockResolvedValue({
        id: new Types.ObjectId().toString(),
        lastMessageContent: 'Hey',
      }),
      markConversationAsRead: jest.fn().mockResolvedValue(undefined),
    };
    authGuard = { authenticate: jest.fn().mockResolvedValue(true) };
    redis = {
      sadd: jest.fn().mockResolvedValue(undefined),
      expire: jest.fn().mockResolvedValue(undefined),
      srem: jest.fn().mockResolvedValue(undefined),
    };

    gateway = new ClientMessagesGateway(
      asMock<ClientMessagesService>(messagesService),
      asMock<WsJwtClientAuthGuard>(authGuard),
      asMock<RedisService>(redis),
    );

    mockServer = makeServerMock();
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── buildRoomId ──────────────────────────────────────────────────────────

  describe('buildRoomId', () => {
    it('should return a namespaced room id from clientId and providerId', () => {
      // Arrange
      const cId = 'client-abc';
      const pId = 'provider-xyz';

      // Act
      const result = buildRoomId(cId, pId);

      // Assert
      expect(result).toBe('client-conversation:client-abc:provider-xyz');
    });
  });

  // ─── handleConnection ─────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('should authenticate, join the client room, and emit CONNECTED on success', async () => {
      // Arrange
      const socket = makeSocket();

      // Act
      await gateway.handleConnection(asSocket(socket));

      // Assert
      expect(authGuard.authenticate).toHaveBeenCalledWith(asSocket(socket));
      expect(socket.join).toHaveBeenCalledWith(clientId);
      expect(socket.emit).toHaveBeenCalledWith(
        MESSAGE_EVENTS.CONNECTED,
        expect.objectContaining({ clientId }),
      );
    });

    it('should add the client to the Redis presence set for the business', async () => {
      // Arrange
      const socket = makeSocket();

      // Act
      await gateway.handleConnection(asSocket(socket));

      // Assert
      expect(redis.sadd).toHaveBeenCalledWith(
        `presence:client:${businessId}`,
        clientId,
      );
    });

    it('should notify the /chat namespace that the client is online', async () => {
      // Arrange
      const socket = makeSocket();

      // Act
      await gateway.handleConnection(asSocket(socket));

      // Assert
      expect(mockServer.of).toHaveBeenCalledWith('/chat');
    });

    it('should return early without joining when authentication fails', async () => {
      // Arrange
      const socket = makeSocket();
      authGuard.authenticate.mockResolvedValue(false);

      // Act
      await gateway.handleConnection(asSocket(socket));

      // Assert
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  // ─── handleDisconnect ─────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('should remove the client from Redis presence and emit CLIENT_OFFLINE', async () => {
      // Arrange
      const socket = makeSocket();

      // Act
      await gateway.handleDisconnect(asSocket(socket));

      // Assert
      expect(redis.srem).toHaveBeenCalledWith(
        `presence:client:${businessId}`,
        clientId,
      );
      expect(mockServer.of).toHaveBeenCalledWith('/chat');
    });

    it('should do nothing when socket.data is missing', async () => {
      // Arrange
      const socket = makeSocket();
      socket.data = {};

      // Act
      await gateway.handleDisconnect(asSocket(socket));

      // Assert
      expect(redis.srem).not.toHaveBeenCalled();
    });
  });

  // ─── handleJoinConversation ───────────────────────────────────────────────

  describe('handleJoinConversation', () => {
    it('should join the conversation room for the given provider', async () => {
      // Arrange
      const socket = makeSocket();
      const expectedRoom = `client-conversation:${clientId}:${providerId}`;

      // Act
      await gateway.handleJoinConversation(asSocket(socket), { providerId });

      // Assert
      expect(socket.join).toHaveBeenCalledWith(expectedRoom);
    });
  });

  // ─── handleLeaveConversation ──────────────────────────────────────────────

  describe('handleLeaveConversation', () => {
    it('should leave the conversation room', async () => {
      // Arrange
      const socket = makeSocket();
      const expectedRoom = `client-conversation:${clientId}:${providerId}`;

      // Act
      await gateway.handleLeaveConversation(asSocket(socket), { providerId });

      // Assert
      expect(socket.leave).toHaveBeenCalledWith(expectedRoom);
    });
  });

  // ─── handleSendMessage ────────────────────────────────────────────────────

  describe('handleSendMessage', () => {
    it('should emit an error event when the socket is not in the conversation room', async () => {
      // Arrange
      const socket = makeSocket();

      // Act
      await gateway.handleSendMessage(asSocket(socket), {
        providerId,
        content: 'Hello',
      });

      // Assert
      expect(socket.emit).toHaveBeenCalledWith(
        MESSAGE_EVENTS.ERROR,
        expect.objectContaining({
          message: CLIENT_MESSAGES.MESSAGE.ERROR.WS_ROOM_NOT_FOUND,
        }),
      );
    });

    it('should send the message and broadcast to the room when in the conversation', async () => {
      // Arrange
      const socket = makeSocket();
      const roomId = buildRoomId(clientId, providerId);
      socket.join(roomId);

      const clientMessage = { id: 'msg-1', content: 'Hello' };
      const rawMessage = { id: 'msg-1', sender: 'client', content: 'Hello' };
      messagesService.sendMessage.mockResolvedValue({
        clientMessage,
        rawMessage,
      });

      // Act
      await gateway.handleSendMessage(asSocket(socket), {
        providerId,
        content: 'Hello',
      });

      // Assert
      expect(messagesService.sendMessage).toHaveBeenCalledWith(
        businessId,
        clientId,
        providerId,
        'Hello',
      );
      expect(mockServer.to).toHaveBeenCalledWith(roomId);
    });

    it('should throw when messagesService.sendMessage returns an HttpException', async () => {
      // Arrange
      const socket = makeSocket();
      const roomId = buildRoomId(clientId, providerId);
      socket.join(roomId);
      messagesService.sendMessage.mockResolvedValue(
        new HttpException('Forbidden', 403),
      );

      // Act & Assert
      await expect(
        gateway.handleSendMessage(asSocket(socket), {
          providerId,
          content: 'Hello',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('should also bridge the message to the /chat business namespace', async () => {
      // Arrange
      const socket = makeSocket();
      const roomId = buildRoomId(clientId, providerId);
      socket.join(roomId);

      const rawMessage = { sender: 'client', content: 'Hello' };
      messagesService.sendMessage.mockResolvedValue({
        clientMessage: { content: 'Hello' },
        rawMessage,
      });

      // Act
      await gateway.handleSendMessage(asSocket(socket), {
        providerId,
        content: 'Hello',
      });

      // Assert
      expect(mockServer.of).toHaveBeenCalledWith('/chat');
    });
  });

  // ─── handleMarkRead ───────────────────────────────────────────────────────

  describe('handleMarkRead', () => {
    it('should mark the conversation as read and emit MESSAGE_READ', async () => {
      // Arrange
      const socket = makeSocket();

      // Act
      await gateway.handleMarkRead(asSocket(socket), { providerId });

      // Assert
      expect(messagesService.markConversationAsRead).toHaveBeenCalledWith(
        businessId,
        clientId,
        providerId,
      );
      const roomId = buildRoomId(clientId, providerId);
      expect(mockServer.to).toHaveBeenCalledWith(roomId);
    });
  });

  // ─── handleTypingStart ────────────────────────────────────────────────────

  describe('handleTypingStart', () => {
    it('should emit TYPING (isTyping:true) to the conversation room', () => {
      // Arrange
      const socket = makeSocket();

      // Act
      gateway.handleTypingStart(asSocket(socket), { providerId });

      // Assert
      expect(socket.to).toHaveBeenCalledWith(buildRoomId(clientId, providerId));
    });

    it('should notify the /chat namespace about client typing', () => {
      // Arrange
      const socket = makeSocket();

      // Act
      gateway.handleTypingStart(asSocket(socket), { providerId });

      // Assert
      expect(mockServer.of).toHaveBeenCalledWith('/chat');
    });
  });

  // ─── handleTypingStop ─────────────────────────────────────────────────────

  describe('handleTypingStop', () => {
    it('should emit TYPING (isTyping:false) to the conversation room', () => {
      // Arrange
      const socket = makeSocket();

      // Act
      gateway.handleTypingStop(asSocket(socket), { providerId });

      // Assert
      expect(socket.to).toHaveBeenCalledWith(buildRoomId(clientId, providerId));
    });
  });
});
