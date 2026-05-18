import { Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Types } from 'mongoose';
import { Socket } from 'socket.io';
import { asMock } from 'test/helpers/mock';
import { WsAuthGuard } from 'src/common/guards/ws-auth.guard';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { MessagingService } from 'src/modules/messaging/services/messaging.service';
import type {
  TeamMessageView,
  AnnouncementView,
} from 'src/modules/messaging/services/messaging.service';
import { MessagingGateway } from 'src/modules/messaging/messaging.gateway';
import { WsEvent } from 'src/modules/messaging/messaging.events';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const businessId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const clientId = new Types.ObjectId().toString();

function makeSocket(overrides: Partial<Record<string, unknown>> = {}) {
  const rooms = new Set<string>();
  const data: Record<string, unknown> = {
    userId,
    businessId,
    senderName: 'Alice',
    ...overrides,
  };
  return {
    id: 'socket-1',
    data,
    rooms,
    join: jest.fn().mockImplementation((room: string) => {
      rooms.add(room);
    }),
    leave: jest.fn().mockImplementation((room: string) => {
      rooms.delete(room);
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  };
}

type MockSocket = ReturnType<typeof makeSocket>;
const asSocket = (s: MockSocket): Socket => s as unknown as Socket;

function makeServerMock() {
  const emitFn = jest.fn();
  const toFn = jest.fn().mockReturnValue({ emit: emitFn });
  const ofFn = jest.fn().mockReturnValue({ to: toFn });
  return { to: toFn, of: ofFn, emit: emitFn };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    businessId: new Types.ObjectId(businessId),
    clientId: new Types.ObjectId(clientId),
    sender: 'business',
    senderName: 'Alice',
    content: 'Hello',
    status: 'sent',
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('MessagingGateway', () => {
  let gateway: MessagingGateway;
  let mockServer: ReturnType<typeof makeServerMock>;

  let messagingService: {
    setRoomActive: jest.Mock;
    getRecentMessages: jest.Mock;
    createMessage: jest.Mock;
    toPayload: jest.Mock;
    markDelivered: jest.Mock;
    markRead: jest.Mock;
    editMessage: jest.Mock;
    deleteMessage: jest.Mock;
    getConversationSummaryForClient: jest.Mock;
  };
  let wsAuthGuard: { authenticate: jest.Mock };
  let redis: {
    sadd: jest.Mock;
    expire: jest.Mock;
    srem: jest.Mock;
    sismember: jest.Mock;
  };
  let employeesRepo: { findByUserId: jest.Mock };

  beforeEach(() => {
    messagingService = {
      setRoomActive: jest.fn().mockResolvedValue(undefined),
      getRecentMessages: jest.fn().mockResolvedValue([]),
      createMessage: jest.fn(),
      toPayload: jest
        .fn()
        .mockImplementation((m: { _id: Types.ObjectId; content?: string }) => ({
          id: m._id.toString(),
          conversationId: '',
          businessId,
          clientId,
          sender: 'business',
          senderName: 'Alice',
          content: m.content,
          status: 'sent',
          createdAt: new Date().toISOString(),
        })),
      markDelivered: jest.fn().mockResolvedValue(undefined),
      markRead: jest.fn().mockResolvedValue(new Date()),
      editMessage: jest.fn(),
      deleteMessage: jest.fn(),
      getConversationSummaryForClient: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        lastMessageContent: 'Hi',
        lastMessageAt: new Date(),
        clientUnreadCount: 0,
      }),
    };
    wsAuthGuard = { authenticate: jest.fn().mockResolvedValue(undefined) };
    redis = {
      sadd: jest.fn().mockResolvedValue(undefined),
      expire: jest.fn().mockResolvedValue(undefined),
      srem: jest.fn().mockResolvedValue(undefined),
      sismember: jest.fn().mockResolvedValue(false),
    };
    employeesRepo = {
      findByUserId: jest.fn().mockResolvedValue({ fullName: 'Alice' }),
    };

    gateway = new MessagingGateway(
      asMock<MessagingService>(messagingService),
      asMock<WsAuthGuard>(wsAuthGuard),
      asMock<RedisService>(redis),
      asMock<EmployeesRepository>(employeesRepo),
    );

    mockServer = makeServerMock();
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── handleConnection ─────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('should authenticate, join the team room, and emit CONNECTED on success', async () => {
      // Arrange
      const socket = makeSocket();
      redis.sadd.mockResolvedValue(undefined);

      // Act
      await gateway.handleConnection(asSocket(socket));

      // Assert
      expect(wsAuthGuard.authenticate).toHaveBeenCalledWith(asSocket(socket));
      expect(socket.join).toHaveBeenCalledWith(`team:${businessId}`);
      expect(socket.emit).toHaveBeenCalledWith(WsEvent.CONNECTED, {
        socketId: socket.id,
        userId,
      });
    });

    it('should add the user to the Redis presence set', async () => {
      // Arrange
      const socket = makeSocket();

      // Act
      await gateway.handleConnection(asSocket(socket));

      // Assert
      expect(redis.sadd).toHaveBeenCalledWith(
        `presence:chat:${businessId}`,
        userId,
      );
    });

    it('should set the senderName from the employee display name', async () => {
      // Arrange
      const socket = makeSocket();
      employeesRepo.findByUserId.mockResolvedValue({ fullName: 'Bob' });

      // Act
      await gateway.handleConnection(asSocket(socket));

      // Assert
      expect(socket.data.senderName).toBe('Bob');
    });

    it('should fall back to "Business" when the employee is not found', async () => {
      // Arrange
      const socket = makeSocket();
      employeesRepo.findByUserId.mockResolvedValue(null);

      // Act
      await gateway.handleConnection(asSocket(socket));

      // Assert
      expect(socket.data.senderName).toBe('Business');
    });

    it('should silently swallow auth errors without crashing', async () => {
      // Arrange
      const socket = makeSocket();
      wsAuthGuard.authenticate.mockRejectedValue(new Error('Invalid token'));

      // Act & Assert — should not throw
      await expect(
        gateway.handleConnection(asSocket(socket)),
      ).resolves.toBeUndefined();
    });
  });

  // ─── handleDisconnect ─────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('should remove the user from the Redis presence set', async () => {
      // Arrange
      const socket = makeSocket();

      // Act
      await gateway.handleDisconnect(asSocket(socket));

      // Assert
      expect(redis.srem).toHaveBeenCalledWith(
        `presence:chat:${businessId}`,
        userId,
      );
    });

    it('should do nothing when socket.data lacks businessId or userId', async () => {
      // Arrange
      const socket = makeSocket();
      socket.data = {};

      // Act
      await gateway.handleDisconnect(asSocket(socket));

      // Assert
      expect(redis.srem).not.toHaveBeenCalled();
    });
  });

  // ─── handleJoinRoom ───────────────────────────────────────────────────────

  describe('handleJoinRoom', () => {
    it('should join the conversation room and emit ROOM_JOINED with history', async () => {
      // Arrange
      const socket = makeSocket();
      const message = makeMessage();
      messagingService.getRecentMessages.mockResolvedValue([message]);
      redis.sismember.mockResolvedValue(true);

      // Act
      await gateway.handleJoinRoom(asSocket(socket), { clientId });

      // Assert
      expect(socket.join).toHaveBeenCalledWith(`${businessId}:${clientId}`);
      expect(socket.emit).toHaveBeenCalledWith(
        WsEvent.ROOM_JOINED,
        expect.objectContaining({
          room: `${businessId}:${clientId}`,
          clientOnline: true,
        }),
      );
    });

    it('should throw WsException when clientId is not a valid ObjectId', async () => {
      // Arrange
      const socket = makeSocket();

      // Act & Assert
      await expect(
        gateway.handleJoinRoom(asSocket(socket), { clientId: 'bad-id' }),
      ).rejects.toThrow(WsException);
    });

    it('should throw WsException when clientId is missing', async () => {
      // Arrange
      const socket = makeSocket();

      // Act & Assert
      await expect(
        gateway.handleJoinRoom(asSocket(socket), { clientId: '' }),
      ).rejects.toThrow(WsException);
    });
  });

  // ─── handleLeaveRoom ──────────────────────────────────────────────────────

  describe('handleLeaveRoom', () => {
    it('should leave the conversation room and mark it inactive', async () => {
      // Arrange
      const socket = makeSocket();

      // Act
      await gateway.handleLeaveRoom(asSocket(socket), { clientId });

      // Assert
      expect(socket.leave).toHaveBeenCalledWith(`${businessId}:${clientId}`);
      expect(messagingService.setRoomActive).toHaveBeenCalledWith(
        businessId,
        clientId,
        false,
      );
    });

    it('should throw WsException for an invalid clientId', async () => {
      // Arrange
      const socket = makeSocket();

      // Act & Assert
      await expect(
        gateway.handleLeaveRoom(asSocket(socket), { clientId: 'not-an-id' }),
      ).rejects.toThrow(WsException);
    });
  });

  // ─── handleSendMessage ────────────────────────────────────────────────────

  describe('handleSendMessage', () => {
    it('should throw WsException when clientId is invalid', async () => {
      // Arrange
      const socket = makeSocket();

      // Act & Assert
      await expect(
        gateway.handleSendMessage(asSocket(socket), {
          clientId: 'bad',
          content: 'hi',
        }),
      ).rejects.toThrow(WsException);
    });

    it('should throw WsException when both content and attachmentUrl are absent', async () => {
      // Arrange
      const socket = makeSocket();

      // Act & Assert
      await expect(
        gateway.handleSendMessage(asSocket(socket), { clientId }),
      ).rejects.toThrow(WsException);
    });

    it('should throw WsException when content exceeds 5000 characters', async () => {
      // Arrange
      const socket = makeSocket();
      const longContent = 'a'.repeat(5001);

      // Act & Assert
      await expect(
        gateway.handleSendMessage(asSocket(socket), {
          clientId,
          content: longContent,
        }),
      ).rejects.toThrow(WsException);
    });

    it('should throw WsException when the socket is not in the room', async () => {
      // Arrange
      const socket = makeSocket();

      // Act & Assert
      await expect(
        gateway.handleSendMessage(asSocket(socket), {
          clientId,
          content: 'Hello',
        }),
      ).rejects.toThrow(WsException);
    });

    it('should create a message and emit MESSAGE_DELIVERED when the socket is in the room', async () => {
      // Arrange
      const socket = makeSocket();
      socket.join(`${businessId}:${clientId}`);
      const message = makeMessage();
      messagingService.createMessage.mockResolvedValue(message);
      messagingService.getConversationSummaryForClient.mockResolvedValue({
        _id: new Types.ObjectId(),
        lastMessageContent: 'Hello',
        lastMessageAt: new Date(),
        clientUnreadCount: 0,
      });

      // Act
      await gateway.handleSendMessage(asSocket(socket), {
        clientId,
        content: 'Hello',
      });

      // Assert
      expect(messagingService.createMessage).toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        WsEvent.MESSAGE_DELIVERED,
        expect.objectContaining({
          messageId: expect.any(String) as unknown as string,
        }),
      );
    });
  });

  // ─── handleMarkRead ───────────────────────────────────────────────────────

  describe('handleMarkRead', () => {
    it('should throw WsException when clientId is invalid', async () => {
      // Arrange
      const socket = makeSocket();

      // Act & Assert
      await expect(
        gateway.handleMarkRead(asSocket(socket), {
          clientId: 'bad',
          upToMessageId: new Types.ObjectId().toString(),
        }),
      ).rejects.toThrow(WsException);
    });

    it('should throw WsException when upToMessageId is invalid', async () => {
      // Arrange
      const socket = makeSocket();

      // Act & Assert
      await expect(
        gateway.handleMarkRead(asSocket(socket), {
          clientId,
          upToMessageId: 'not-an-id',
        }),
      ).rejects.toThrow(WsException);
    });

    it('should call markRead and emit MESSAGE_READ to the room', async () => {
      // Arrange
      const socket = makeSocket();
      const upToMessageId = new Types.ObjectId().toString();
      const readAt = new Date('2026-05-01T12:00:00Z');
      messagingService.markRead.mockResolvedValue(readAt);

      // Act
      await gateway.handleMarkRead(asSocket(socket), {
        clientId,
        upToMessageId,
      });

      // Assert
      expect(messagingService.markRead).toHaveBeenCalledWith(
        expect.objectContaining({ businessId, clientId, upToMessageId }),
      );
      expect(mockServer.to).toHaveBeenCalledWith(`${businessId}:${clientId}`);
    });
  });

  // ─── handleEditMessage ────────────────────────────────────────────────────

  describe('handleEditMessage', () => {
    it('should throw WsException when messageId is invalid', async () => {
      // Arrange
      const socket = makeSocket();

      // Act & Assert
      await expect(
        gateway.handleEditMessage(asSocket(socket), {
          messageId: 'bad',
          content: 'edited',
        }),
      ).rejects.toThrow(WsException);
    });

    it('should throw WsException when content is empty', async () => {
      // Arrange
      const socket = makeSocket();

      // Act & Assert
      await expect(
        gateway.handleEditMessage(asSocket(socket), {
          messageId: new Types.ObjectId().toString(),
          content: '',
        }),
      ).rejects.toThrow(WsException);
    });

    it('should edit the message and emit MESSAGE_EDITED to the room', async () => {
      // Arrange
      const socket = makeSocket();
      const messageId = new Types.ObjectId().toString();
      const message = makeMessage({ _id: new Types.ObjectId(messageId) });
      messagingService.editMessage.mockResolvedValue(message);

      // Act
      await gateway.handleEditMessage(asSocket(socket), {
        messageId,
        content: 'updated text',
      });

      // Assert
      expect(messagingService.editMessage).toHaveBeenCalledWith(
        expect.objectContaining({ messageId, content: 'updated text' }),
      );
      expect(mockServer.to).toHaveBeenCalledWith(`${businessId}:${clientId}`);
    });
  });

  // ─── handleDeleteMessage ──────────────────────────────────────────────────

  describe('handleDeleteMessage', () => {
    it('should throw WsException when messageId is invalid', async () => {
      // Arrange
      const socket = makeSocket();

      // Act & Assert
      await expect(
        gateway.handleDeleteMessage(asSocket(socket), { messageId: 'bad-id' }),
      ).rejects.toThrow(WsException);
    });

    it('should delete the message and emit MESSAGE_DELETED to the room', async () => {
      // Arrange
      const socket = makeSocket();
      const messageId = new Types.ObjectId().toString();
      const message = makeMessage({ _id: new Types.ObjectId(messageId) });
      messagingService.deleteMessage.mockResolvedValue(message);

      // Act
      await gateway.handleDeleteMessage(asSocket(socket), { messageId });

      // Assert
      expect(messagingService.deleteMessage).toHaveBeenCalledWith(
        expect.objectContaining({ messageId }),
      );
    });
  });

  // ─── emitTeamMessage ──────────────────────────────────────────────────────

  describe('emitTeamMessage', () => {
    it('should emit TEAM_MESSAGE_SENT to the team room', () => {
      // Arrange
      const teamMessage: TeamMessageView = {
        id: new Types.ObjectId().toString(),
        content: 'Team update',
      } as TeamMessageView;

      // Act
      gateway.emitTeamMessage(businessId, teamMessage);

      // Assert
      expect(mockServer.to).toHaveBeenCalledWith(`team:${businessId}`);
    });
  });

  // ─── emitAnnouncement ─────────────────────────────────────────────────────

  describe('emitAnnouncement', () => {
    it('should emit ANNOUNCEMENT_CREATED to the team room', () => {
      // Arrange
      const announcement: AnnouncementView = {
        id: new Types.ObjectId().toString(),
        title: 'New policy',
      } as AnnouncementView;

      // Act
      gateway.emitAnnouncement(businessId, announcement);

      // Assert
      expect(mockServer.to).toHaveBeenCalledWith(`team:${businessId}`);
    });
  });
});
