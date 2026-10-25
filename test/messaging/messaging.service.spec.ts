import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { JOBS } from 'src/common/constants/agenda.constants';
import { MESSAGING_MESSAGES } from 'src/common/constants/messages/messaging.messages';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { ClientsRepository } from 'src/modules/clients/repositories/clients.repository';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { MessagingRepository } from 'src/modules/messaging/repositories/messaging.repository';
import { MessagingService } from 'src/modules/messaging/services/messaging.service';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import {
  MessageSender,
  MessageStatus,
} from 'src/modules/messaging/schemas/message.schema';
import type { Conversation } from 'src/modules/messaging/schemas/conversation.schema';
import type { Message } from 'src/modules/messaging/schemas/message.schema';
import { asMock } from 'test/helpers/mock';

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
  let usersRepository: {
    findActiveStaffEmailRecipients: jest.Mock;
  };
  let businessRepository: {
    findById: jest.Mock;
  };
  let agendaService: {
    now: jest.Mock;
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
    }) as Message;

  const makeConversation = (): Conversation =>
    ({
      _id: new Types.ObjectId(),
      businessId: new Types.ObjectId(businessId),
      clientId: new Types.ObjectId(clientId),
      lastMessageContent: '',
      businessUnreadCount: 0,
      clientUnreadCount: 0,
      isActive: false,
    }) as Conversation;

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
    usersRepository = { findActiveStaffEmailRecipients: jest.fn() };
    businessRepository = { findById: jest.fn() };
    agendaService = { now: jest.fn().mockResolvedValue(undefined) };
    businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });

    service = new MessagingService(
      asMock<MessagingRepository>(messagingRepository),
      asMock<ClientsRepository>(clientsRepository),
      asMock<EmployeesRepository>(employeesRepository),
      asMock<BusinessRepository>(businessRepository),
      asMock<UsersRepository>(usersRepository),
      asMock<AgendaService>(agendaService),
    );

    loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
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

  // ─── createAnnouncement ────────────────────────────────────────────────────

  describe('createAnnouncement', () => {
    it('should enqueue staff announcement email jobs in the background', async () => {
      const actorId = new Types.ObjectId();
      const announcementId = new Types.ObjectId();

      employeesRepository.findByUserId.mockResolvedValue({
        _id: actorId,
        fullName: 'Alice Admin',
      });
      businessRepository.findById.mockResolvedValue({
        timezone: 'UTC',
        name: 'Acme Services',
      });
      usersRepository.findActiveStaffEmailRecipients.mockResolvedValue([
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        },
        {
          firstName: 'Sam',
          lastName: '',
          email: 'sam@example.com',
        },
      ]);
      messagingRepository.createAnnouncement.mockResolvedValue({
        _id: announcementId,
        businessId: new Types.ObjectId(businessId),
        authorId: actorId,
        authorName: 'Alice Admin',
        title: 'Q2 Performance Review',
        description: 'Complete your self-assessment by April 30.',
        createdAt: new Date('2026-04-30T17:00:00.000Z'),
      });

      const result = await service.createAnnouncement({
        businessId,
        userId: actorId.toString(),
        title: 'Q2 Performance Review',
        description: 'Complete your self-assessment by April 30.',
      });

      expect(result).not.toBeInstanceOf(Error);
      expect(messagingRepository.createAnnouncement).toHaveBeenCalledTimes(1);

      // Allow fire-and-forget enqueue to settle.
      await new Promise((resolve) => setImmediate(resolve));

      expect(
        usersRepository.findActiveStaffEmailRecipients,
      ).toHaveBeenCalledWith(expect.any(Types.ObjectId));
      expect(agendaService.now).toHaveBeenCalledTimes(2);
      expect(agendaService.now).toHaveBeenCalledWith(
        JOBS.EMAIL_TEAM_ANNOUNCEMENT,
        expect.objectContaining({
          to: 'jane@example.com',
          recipientName: 'Jane Smith',
          businessName: 'Acme Services',
          title: 'Q2 Performance Review',
          description: 'Complete your self-assessment by April 30.',
          authorName: 'Alice Admin',
        }),
      );
    });

    it('should not enqueue jobs when no staff recipients exist', async () => {
      const actorId = new Types.ObjectId();
      const createdAt = new Date('2026-04-30T17:00:00.000Z');

      employeesRepository.findByUserId.mockResolvedValue({
        _id: actorId,
        fullName: 'Alice Admin',
      });
      businessRepository.findById.mockResolvedValue({
        timezone: 'UTC',
        name: 'Acme Services',
      });
      usersRepository.findActiveStaffEmailRecipients.mockResolvedValue([]);
      messagingRepository.createAnnouncement.mockResolvedValue({
        _id: new Types.ObjectId(),
        businessId: new Types.ObjectId(businessId),
        authorId: actorId,
        authorName: 'Alice Admin',
        title: 'Downtime notice',
        description: 'System maintenance starts at 8 PM.',
        createdAt,
      });

      await service.createAnnouncement({
        businessId,
        userId: actorId.toString(),
        title: 'Downtime notice',
        description: 'System maintenance starts at 8 PM.',
      });

      await new Promise((resolve) => setImmediate(resolve));
      expect(agendaService.now).not.toHaveBeenCalled();
    });

    it('should process a large staff list across sequential batches', async () => {
      // Arrange
      const actorId = new Types.ObjectId();
      employeesRepository.findByUserId.mockResolvedValue({
        _id: actorId,
        fullName: 'Alice Admin',
      });
      businessRepository.findById.mockResolvedValue({
        timezone: 'UTC',
        name: 'Acme Services',
      });

      // 110 recipients spans three batches: 50 + 50 + 10
      const recipients = Array.from({ length: 110 }, (_, i) => ({
        firstName: 'Staff',
        lastName: String(i),
        email: `staff${i}@example.com`,
      }));
      usersRepository.findActiveStaffEmailRecipients.mockResolvedValue(
        recipients,
      );
      messagingRepository.createAnnouncement.mockResolvedValue({
        _id: new Types.ObjectId(),
        businessId: new Types.ObjectId(businessId),
        authorId: actorId,
        authorName: 'Alice Admin',
        title: 'All-hands',
        description: 'Meeting at noon.',
        createdAt: new Date(),
      });

      // Act
      await service.createAnnouncement({
        businessId,
        userId: actorId.toString(),
        title: 'All-hands',
        description: 'Meeting at noon.',
      });
      await new Promise((resolve) => setImmediate(resolve));

      // Assert — every recipient receives exactly one enqueue call
      expect(agendaService.now).toHaveBeenCalledTimes(110);
    });
  });

  // ─── enqueue retry behavior ────────────────────────────────────────────────

  describe('enqueue retry behavior', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should succeed on a retry after a transient enqueue failure', async () => {
      // Arrange
      const actorId = new Types.ObjectId();
      employeesRepository.findByUserId.mockResolvedValue({
        _id: actorId,
        fullName: 'Alice Admin',
      });
      businessRepository.findById.mockResolvedValue({
        timezone: 'UTC',
        name: 'Acme Services',
      });
      usersRepository.findActiveStaffEmailRecipients.mockResolvedValue([
        { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
      ]);
      messagingRepository.createAnnouncement.mockResolvedValue({
        _id: new Types.ObjectId(),
        businessId: new Types.ObjectId(businessId),
        authorId: actorId,
        authorName: 'Alice Admin',
        title: 'Retry test',
        description: 'Body.',
        createdAt: new Date(),
      });
      // Fail once, then succeed on the first retry
      agendaService.now
        .mockRejectedValueOnce(new Error('Transient write error'))
        .mockResolvedValue(undefined);

      // Act
      await service.createAnnouncement({
        businessId,
        userId: actorId.toString(),
        title: 'Retry test',
        description: 'Body.',
      });
      await jest.runAllTimersAsync();

      // Assert — 1 failed attempt + 1 successful retry = 2 calls; no warning logged
      expect(agendaService.now).toHaveBeenCalledTimes(2);
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });

    it('should exhaust all retries and log a warning when enqueue permanently fails', async () => {
      // Arrange
      const actorId = new Types.ObjectId();
      employeesRepository.findByUserId.mockResolvedValue({
        _id: actorId,
        fullName: 'Alice Admin',
      });
      businessRepository.findById.mockResolvedValue({
        timezone: 'UTC',
        name: 'Acme Services',
      });
      usersRepository.findActiveStaffEmailRecipients.mockResolvedValue([
        { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
      ]);
      messagingRepository.createAnnouncement.mockResolvedValue({
        _id: new Types.ObjectId(),
        businessId: new Types.ObjectId(businessId),
        authorId: actorId,
        authorName: 'Alice Admin',
        title: 'Retry exhaust test',
        description: 'Body.',
        createdAt: new Date(),
      });
      // Always fail — exhausts all 3 retries (4 total attempts)
      agendaService.now.mockRejectedValue(new Error('Persistent write error'));

      // Act
      await service.createAnnouncement({
        businessId,
        userId: actorId.toString(),
        title: 'Retry exhaust test',
        description: 'Body.',
      });
      await jest.runAllTimersAsync();

      // Assert — 1 initial + 3 retries = 4 calls; partial failure warning logged
      expect(agendaService.now).toHaveBeenCalledTimes(4);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed=1'),
      );
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
      Object.assign(msg, { createdAt: now });

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
