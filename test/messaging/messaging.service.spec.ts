import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PassThrough } from 'stream';
import { v2 as cloudinary } from 'cloudinary';
import { Types } from 'mongoose';
import { MESSAGING_MESSAGES } from 'src/common/constants/messages/messaging.messages';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { ClientsRepository } from 'src/modules/clients/repositories/clients.repository';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { MessagingRepository } from 'src/modules/messaging/repositories/messaging.repository';
import {
  MessagingService,
  UploadResult,
} from 'src/modules/messaging/services/messaging.service';
import {
  MessageSender,
  MessageStatus,
} from 'src/modules/messaging/schemas/message.schema';
import type { Conversation } from 'src/modules/messaging/schemas/conversation.schema';
import type { Message } from 'src/modules/messaging/schemas/message.schema';

jest.mock('cloudinary', () => ({
  v2: {
    uploader: {
      upload_stream: jest.fn(),
    },
  },
}));

describe('MessagingService', () => {
  let service: MessagingService;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let messagingRepository: {
    upsertConversation: jest.Mock;
    createMessage: jest.Mock;
    updateConversationAfterMessage: jest.Mock;
    markMessageDelivered: jest.Mock;
    findMessages: jest.Mock;
    findRecentMessages: jest.Mock;
    markMessagesRead: jest.Mock;
    resetUnreadCount: jest.Mock;
    setConversationActive: jest.Mock;
    updateMessageContent: jest.Mock;
    softDeleteMessage: jest.Mock;
    findConversations: jest.Mock;
    findConversationThreads: jest.Mock;
    createTeamMessage: jest.Mock;
    findTeamMessages: jest.Mock;
    createAnnouncement: jest.Mock;
    findAnnouncements: jest.Mock;
  };
  let clientsRepository: {
    findById: jest.Mock;
  };
  let employeesRepository: {
    findByUserId: jest.Mock;
  };
  let businessRepository: {
    findById: jest.Mock;
  };

  const businessId = new Types.ObjectId().toString();
  const clientId = new Types.ObjectId().toString();
  const messageId = new Types.ObjectId();

  const makeMessage = (overrides: Partial<Message> = {}): Message =>
    ({
      _id: messageId,
      businessId: new Types.ObjectId(businessId),
      clientId: new Types.ObjectId(clientId),
      conversationId: new Types.ObjectId(),
      sender: MessageSender.BUSINESS,
      senderName: 'Alice',
      content: 'Hello',
      status: MessageStatus.SENT,
      ...overrides,
    }) as unknown as Message;

  const makeConversation = (): Conversation =>
    ({
      _id: new Types.ObjectId(),
      businessId: new Types.ObjectId(businessId),
      clientId: new Types.ObjectId(clientId),
      lastMessageContent: '',
      businessUnreadCount: 0,
      clientUnreadCount: 0,
      isActive: false,
    }) as unknown as Conversation;

  beforeEach(() => {
    messagingRepository = {
      upsertConversation: jest.fn(),
      createMessage: jest.fn(),
      updateConversationAfterMessage: jest.fn(),
      markMessageDelivered: jest.fn(),
      findMessages: jest.fn(),
      findRecentMessages: jest.fn(),
      markMessagesRead: jest.fn(),
      resetUnreadCount: jest.fn(),
      setConversationActive: jest.fn(),
      updateMessageContent: jest.fn(),
      softDeleteMessage: jest.fn(),
      findConversations: jest.fn(),
      findConversationThreads: jest.fn(),
      createTeamMessage: jest.fn(),
      findTeamMessages: jest.fn(),
      createAnnouncement: jest.fn(),
      findAnnouncements: jest.fn(),
    };
    clientsRepository = { findById: jest.fn() };
    employeesRepository = { findByUserId: jest.fn() };
    businessRepository = { findById: jest.fn() };
    businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });

    service = new MessagingService(
      messagingRepository as unknown as MessagingRepository,
      clientsRepository as unknown as ClientsRepository,
      employeesRepository as unknown as EmployeesRepository,
      businessRepository as unknown as BusinessRepository,
    );

    loggerWarnSpy = jest
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    loggerErrorSpy = jest
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  // ─── createMessage ─────────────────────────────────────────────────────────

  describe('createMessage', () => {
    it('should upsert conversation, create message, and update conversation', async () => {
      // Arrange
      const conversation = makeConversation();
      const message = makeMessage();
      messagingRepository.upsertConversation.mockResolvedValue(conversation);
      messagingRepository.createMessage.mockResolvedValue(message);
      messagingRepository.updateConversationAfterMessage.mockResolvedValue(
        undefined,
      );

      // Act
      const result = await service.createMessage({
        businessId,
        clientId,
        sender: MessageSender.BUSINESS,
        senderName: 'Alice',
        content: 'Hello',
      });

      // Assert
      expect(messagingRepository.upsertConversation).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.any(Types.ObjectId),
      );
      expect(messagingRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: conversation._id,
          sender: MessageSender.BUSINESS,
          senderName: 'Alice',
          content: 'Hello',
        }),
      );
      expect(
        messagingRepository.updateConversationAfterMessage,
      ).toHaveBeenCalledWith(
        conversation._id,
        'Hello',
        MessageSender.BUSINESS,
        expect.any(Date),
      );
      expect(result).toBe(message);
    });

    it('should pass attachment fields through to the repository', async () => {
      // Arrange
      const conversation = makeConversation();
      messagingRepository.upsertConversation.mockResolvedValue(conversation);
      messagingRepository.createMessage.mockResolvedValue(
        makeMessage({ content: undefined }),
      );
      messagingRepository.updateConversationAfterMessage.mockResolvedValue(
        undefined,
      );

      // Act
      await service.createMessage({
        businessId,
        clientId,
        sender: MessageSender.CLIENT,
        senderName: 'Bob',
        attachmentUrl: 'https://cdn.example.com/file.pdf',
        publicId: 'pub123',
        mimeType: 'application/pdf',
        fileName: 'file.pdf',
        fileSize: 4096,
      });

      // Assert
      expect(messagingRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentUrl: 'https://cdn.example.com/file.pdf',
          mimeType: 'application/pdf',
        }),
      );
    });
  });

  // ─── sendMessageFromBusiness ───────────────────────────────────────────────

  describe('sendMessageFromBusiness', () => {
    it('should validate content and return BadRequestException when empty', async () => {
      // Act
      const result = await service.sendMessageFromBusiness({
        businessId,
        userId: new Types.ObjectId().toString(),
        clientId,
        content: '   ',
      });

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
      expect(clientsRepository.findById).not.toHaveBeenCalled();
    });

    it('should persist and map a business message when client exists', async () => {
      // Arrange
      const userId = new Types.ObjectId().toString();
      const employeeId = new Types.ObjectId();
      const conversation = makeConversation();

      clientsRepository.findById.mockResolvedValue({
        _id: new Types.ObjectId(clientId),
        name: 'Client A',
      });
      employeesRepository.findByUserId.mockResolvedValue({
        _id: employeeId,
        fullName: 'Alice Admin',
      });
      messagingRepository.upsertConversation.mockResolvedValue(conversation);
      messagingRepository.createMessage.mockResolvedValue(
        makeMessage({
          senderName: 'Alice Admin',
          content: 'Your invoice is ready.',
        }),
      );
      messagingRepository.updateConversationAfterMessage.mockResolvedValue(
        undefined,
      );
      businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });

      // Act
      const result = await service.sendMessageFromBusiness({
        businessId,
        userId,
        clientId,
        content: 'Your invoice is ready.',
      });

      // Assert
      expect(result).not.toBeInstanceOf(Error);
      expect(messagingRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: MessageSender.BUSINESS,
          senderName: 'Alice Admin',
          content: 'Your invoice is ready.',
        }),
      );
      const payload = result as { content?: string; senderName: string };
      expect(payload.senderName).toBe('Alice Admin');
      expect(payload.content).toBe('Your invoice is ready.');
    });
  });

  // ─── getOrCreateConversation ───────────────────────────────────────────────

  describe('getOrCreateConversation', () => {
    it('should return conversation and messages mapped to payloads', async () => {
      // Arrange
      const conversation = makeConversation();
      const msg = makeMessage({ createdAt: new Date('2026-01-01') } as never);
      messagingRepository.upsertConversation.mockResolvedValue(conversation);
      messagingRepository.findRecentMessages.mockResolvedValue([msg]);

      // Act
      const result = await service.getOrCreateConversation(
        businessId,
        clientId,
      );

      // Assert
      expect(result.conversation).toBe(conversation);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe(messageId.toString());
      expect(result.messages[0].sender).toBe(MessageSender.BUSINESS);
      expect(result.messages[0].senderName).toBe('Alice');
      expect(result.messages[0].content).toBe('Hello');
    });

    it('should return empty messages array when no messages exist', async () => {
      // Arrange
      messagingRepository.upsertConversation.mockResolvedValue(
        makeConversation(),
      );
      messagingRepository.findRecentMessages.mockResolvedValue([]);

      // Act
      const result = await service.getOrCreateConversation(
        businessId,
        clientId,
      );

      // Assert
      expect(result.messages).toEqual([]);
    });
  });

  // ─── markDelivered ─────────────────────────────────────────────────────────

  describe('markDelivered', () => {
    it('should delegate to repository', async () => {
      // Arrange
      messagingRepository.markMessageDelivered.mockResolvedValue(undefined);

      // Act
      await service.markDelivered(messageId);

      // Assert
      expect(messagingRepository.markMessageDelivered).toHaveBeenCalledWith(
        messageId,
      );
    });
  });

  // ─── getMessages ───────────────────────────────────────────────────────────

  describe('getMessages', () => {
    it('should return messages when client exists', async () => {
      // Arrange
      const messages = [makeMessage()];
      clientsRepository.findById.mockResolvedValue({
        _id: new Types.ObjectId(clientId),
      });
      messagingRepository.findMessages.mockResolvedValue({
        data: messages,
        total: 1,
      });

      // Act
      const result = await service.getMessages(businessId, clientId, {
        page: 1,
        limit: 20,
        skip: 0,
      });

      // Assert
      expect(result).not.toBeInstanceOf(Error);
      const paginated = result as { data: Message[]; total: number };
      expect(paginated.data).toEqual(messages);
      expect(paginated.total).toBe(1);
      expect(clientsRepository.findById).toHaveBeenCalledWith(
        clientId,
        expect.any(Types.ObjectId),
      );
      expect(messagingRepository.resetUnreadCount).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.any(Types.ObjectId),
        MessageSender.BUSINESS,
      );
    });

    it('should return NotFoundException when client does not exist', async () => {
      // Arrange
      clientsRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.getMessages(businessId, clientId, {
        page: 1,
        limit: 20,
        skip: 0,
      });

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect(messagingRepository.findMessages).not.toHaveBeenCalled();
    });
  });

  // ─── markRead ──────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('should mark messages read and reset unread count', async () => {
      // Arrange
      messagingRepository.markMessagesRead.mockResolvedValue(undefined);
      messagingRepository.resetUnreadCount.mockResolvedValue(undefined);
      const upToMessageId = new Types.ObjectId().toString();

      // Act
      const readAt = await service.markRead({
        businessId,
        clientId,
        upToMessageId,
        readerSender: MessageSender.BUSINESS,
      });

      // Assert
      expect(messagingRepository.markMessagesRead).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.any(Types.ObjectId),
        upToMessageId,
        MessageSender.BUSINESS,
        expect.any(Date),
      );
      expect(messagingRepository.resetUnreadCount).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.any(Types.ObjectId),
        MessageSender.BUSINESS,
      );
      expect(readAt).toBeInstanceOf(Date);
    });
  });

  // ─── markMessagesReadFromBusiness ──────────────────────────────────────────

  describe('markMessagesReadFromBusiness', () => {
    it('should return NotFoundException when client does not exist', async () => {
      // Arrange
      clientsRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.markMessagesReadFromBusiness({
        businessId,
        userId: new Types.ObjectId().toString(),
        clientId,
        upToMessageId: new Types.ObjectId().toString(),
      });

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect(messagingRepository.markMessagesRead).not.toHaveBeenCalled();
    });

    it('should mark read and return event payload details', async () => {
      // Arrange
      const userId = new Types.ObjectId().toString();
      const upToMessageId = new Types.ObjectId().toString();
      clientsRepository.findById.mockResolvedValue({
        _id: new Types.ObjectId(clientId),
      });
      businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });
      messagingRepository.markMessagesRead.mockResolvedValue(undefined);
      messagingRepository.resetUnreadCount.mockResolvedValue(undefined);

      // Act
      const result = await service.markMessagesReadFromBusiness({
        businessId,
        userId,
        clientId,
        upToMessageId,
      });

      // Assert
      expect(result).not.toBeInstanceOf(Error);
      const payload = result as {
        upToMessageId: string;
        readAt: string;
        readBy: string;
      };
      expect(payload.upToMessageId).toBe(upToMessageId);
      expect(payload.readBy).toBe(userId);
      expect(new Date(payload.readAt).toString()).not.toBe('Invalid Date');
    });
  });

  // ─── setRoomActive ─────────────────────────────────────────────────────────

  describe('setRoomActive', () => {
    it('should delegate to repository with correct active state', async () => {
      // Arrange
      messagingRepository.setConversationActive.mockResolvedValue(undefined);

      // Act
      await service.setRoomActive(businessId, clientId, true);

      // Assert
      expect(messagingRepository.setConversationActive).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.any(Types.ObjectId),
        true,
      );
    });
  });

  // ─── editMessage ───────────────────────────────────────────────────────────

  describe('editMessage', () => {
    it('should return the updated message when found', async () => {
      // Arrange
      const updated = makeMessage({ content: 'Updated', editedAt: new Date() });
      messagingRepository.updateMessageContent.mockResolvedValue(updated);

      // Act
      const result = await service.editMessage({
        messageId: messageId.toString(),
        businessId,
        sender: MessageSender.BUSINESS,
        content: 'Updated',
      });

      // Assert
      expect(result).toBe(updated);
      expect(messagingRepository.updateMessageContent).toHaveBeenCalledWith(
        messageId.toString(),
        expect.any(Types.ObjectId),
        MessageSender.BUSINESS,
        'Updated',
      );
    });

    it('should throw NotFoundException when message is not found', async () => {
      // Arrange
      messagingRepository.updateMessageContent.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.editMessage({
          messageId: messageId.toString(),
          businessId,
          sender: MessageSender.BUSINESS,
          content: 'Updated',
        }),
      ).rejects.toThrow(
        new NotFoundException(MESSAGING_MESSAGES.ERROR.SEND_FAILED),
      );
    });
  });

  // ─── deleteMessage ─────────────────────────────────────────────────────────

  describe('deleteMessage', () => {
    it('should return the deleted message when found', async () => {
      // Arrange
      const deleted = makeMessage({ deletedAt: new Date() });
      messagingRepository.softDeleteMessage.mockResolvedValue(deleted);

      // Act
      const result = await service.deleteMessage({
        messageId: messageId.toString(),
        businessId,
        sender: MessageSender.BUSINESS,
      });

      // Assert
      expect(result).toBe(deleted);
      expect(messagingRepository.softDeleteMessage).toHaveBeenCalledWith(
        messageId.toString(),
        expect.any(Types.ObjectId),
        MessageSender.BUSINESS,
      );
    });

    it('should throw NotFoundException when message is not found', async () => {
      // Arrange
      messagingRepository.softDeleteMessage.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.deleteMessage({
          messageId: messageId.toString(),
          businessId,
          sender: MessageSender.BUSINESS,
        }),
      ).rejects.toThrow(
        new NotFoundException(MESSAGING_MESSAGES.ERROR.SEND_FAILED),
      );
    });
  });

  // ─── getConversations ──────────────────────────────────────────────────────

  describe('getConversations', () => {
    it('should return paginated conversations', async () => {
      // Arrange
      const thread = {
        conversationId: new Types.ObjectId(),
        client: {
          id: new Types.ObjectId(),
          fullName: 'Jane Smith',
          email: 'jane@example.com',
        },
        lastMessageContent: 'Hello',
        lastMessageAt: new Date('2026-01-01T10:00:00.000Z'),
        lastMessageSender: MessageSender.BUSINESS,
        businessUnreadCount: 0,
        clientUnreadCount: 1,
      };
      messagingRepository.findConversationThreads.mockResolvedValue({
        data: [thread],
        total: 1,
      });

      // Act
      const result = await service.getConversations(businessId, {
        page: 1,
        limit: 20,
        skip: 0,
      });

      // Assert
      expect(result).not.toBeInstanceOf(Error);
      const paginated = result as {
        data: { conversationId: string; client: { fullName: string } }[];
        total: number;
      };
      expect(paginated.data).toHaveLength(1);
      expect(paginated.data[0].conversationId).toBe(
        thread.conversationId.toString(),
      );
      expect(paginated.data[0].client.fullName).toBe('Jane Smith');
      expect(paginated.total).toBe(1);
      expect(messagingRepository.findConversationThreads).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        { page: 1, limit: 20, skip: 0 },
      );
    });
  });

  // ─── uploadAttachment ──────────────────────────────────────────────────────

  describe('uploadAttachment', () => {
    const makeFile = (
      overrides: Partial<Express.Multer.File> = {},
    ): Express.Multer.File =>
      ({
        mimetype: 'image/jpeg',
        size: 1024,
        originalname: 'photo.jpg',
        buffer: Buffer.from('fake'),
        ...overrides,
      }) as Express.Multer.File;

    it('should return BadRequestException when file exceeds 10 MB', async () => {
      // Arrange
      const file = makeFile({ size: 11 * 1024 * 1024 });

      // Act
      const result = await service.uploadAttachment(file, businessId);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
    });

    it('should return BadRequestException for unsupported mime types', async () => {
      // Arrange
      const file = makeFile({ mimetype: 'application/x-executable' });

      // Act
      const result = await service.uploadAttachment(file, businessId);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
    });

    it('should resolve with upload result on successful upload', async () => {
      // Arrange
      const file = makeFile();
      const fakeResult = {
        secure_url: 'https://cdn.cloudinary.com/photo.jpg',
        public_id: 'attachments/biz123/photo',
      };

      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (_opts: unknown, cb: (err: null, res: typeof fakeResult) => void) => {
          const passthrough = new PassThrough();
          process.nextTick(() => cb(null, fakeResult));
          return passthrough;
        },
      );

      // Act
      const result = await service.uploadAttachment(file, businessId);

      // Assert
      expect(result).not.toBeInstanceOf(Error);
      const upload = result as UploadResult;
      expect(upload.attachmentUrl).toBe(fakeResult.secure_url);
      expect(upload.publicId).toBe(fakeResult.public_id);
      expect(upload.mimeType).toBe('image/jpeg');
      expect(upload.fileName).toBe('photo.jpg');
      expect(upload.fileSize).toBe(1024);
    });

    it('should return InternalServerErrorException when cloudinary returns an error', async () => {
      // Arrange
      const file = makeFile();
      const cloudinaryError = new Error('Upload failed');

      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (_opts: unknown, cb: (err: Error, res: null) => void) => {
          const passthrough = new PassThrough();
          process.nextTick(() => cb(cloudinaryError, null));
          return passthrough;
        },
      );

      // Act
      const result = await service.uploadAttachment(file, businessId);

      // Assert
      expect(result).toBeInstanceOf(Error);
    });
  });

  // ─── toPayload ─────────────────────────────────────────────────────────────

  describe('toPayload', () => {
    it('should map all message fields to a payload object', () => {
      // Arrange
      const now = new Date('2026-01-01T12:00:00.000Z');
      const msg = makeMessage({
        status: MessageStatus.READ,
        deliveredAt: now,
        readAt: now,
        editedAt: now,
        attachmentUrl: 'https://cdn.example.com/f.pdf',
        publicId: 'pub1',
        mimeType: 'application/pdf',
        fileName: 'f.pdf',
        fileSize: 2048,
      });
      (msg as unknown as { createdAt: Date }).createdAt = now;

      // Act
      const payload = service.toPayload(msg as Message & { createdAt?: Date });

      // Assert
      expect(payload.id).toBe(messageId.toString());
      expect(payload.sender).toBe(MessageSender.BUSINESS);
      expect(payload.senderName).toBe('Alice');
      expect(payload.content).toBe('Hello');
      expect(payload.status).toBe(MessageStatus.READ);
      expect(payload.deliveredAt).toBe(now.toISOString());
      expect(payload.readAt).toBe(now.toISOString());
      expect(payload.editedAt).toBe(now.toISOString());
      expect(payload.attachmentUrl).toBe('https://cdn.example.com/f.pdf');
      expect(payload.createdAt).toBe(now.toISOString());
    });

    it('should use current time as createdAt fallback when not set', () => {
      // Arrange
      const before = Date.now();
      const msg = makeMessage();

      // Act
      const payload = service.toPayload(msg as Message & { createdAt?: Date });

      // Assert
      expect(new Date(payload.createdAt).getTime()).toBeGreaterThanOrEqual(
        before,
      );
    });
  });
});
