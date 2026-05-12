import { NotFoundException } from '@nestjs/common';
import { MESSAGING_MESSAGES } from 'src/common/constants/messages/messaging.messages';
import { MessagingController } from 'src/modules/messaging/controllers/messaging.controller';
import { MessagingGateway } from 'src/modules/messaging/messaging.gateway';
import { MessagingService } from 'src/modules/messaging/services/messaging.service';

type JwtUserLike = {
  sub: string;
  businessId: string;
};

describe('MessagingController', () => {
  let controller: MessagingController;
  let messagingService: {
    sendMessageFromBusiness: jest.Mock;
    markMessagesReadFromBusiness: jest.Mock;
  };
  let messagingGateway: {
    emitMessageReceivedToConversation: jest.Mock;
    emitMessageReadToConversation: jest.Mock;
  };

  beforeEach(() => {
    messagingService = {
      sendMessageFromBusiness: jest.fn(),
      markMessagesReadFromBusiness: jest.fn(),
    };
    messagingGateway = {
      emitMessageReceivedToConversation: jest.fn(),
      emitMessageReadToConversation: jest.fn(),
    };

    controller = new MessagingController(
      messagingService as unknown as MessagingService,
      messagingGateway as unknown as MessagingGateway,
    );
  });

  it('should send a message and emit message_received to the room', async () => {
    // Arrange
    const user: JwtUserLike = {
      sub: 'user_1',
      businessId: 'biz_1',
    };
    const dto = {
      clientId: 'client_1',
      content: 'Your invoice is ready.',
    };
    const payload = {
      id: 'msg_1',
      conversationId: 'conv_1',
      businessId: 'biz_1',
      clientId: 'client_1',
      sender: 'business',
      senderName: 'Business',
      content: 'Your invoice is ready.',
      status: 'sent',
      createdAt: new Date().toISOString(),
    };
    messagingService.sendMessageFromBusiness.mockResolvedValue(payload);

    // Act
    const result = await controller.sendMessage(user as never, dto);

    // Assert
    expect(messagingService.sendMessageFromBusiness).toHaveBeenCalledWith({
      businessId: 'biz_1',
      userId: 'user_1',
      clientId: 'client_1',
      content: 'Your invoice is ready.',
      attachmentUrl: undefined,
      publicId: undefined,
      mimeType: undefined,
      fileName: undefined,
      fileSize: undefined,
    });
    expect(
      messagingGateway.emitMessageReceivedToConversation,
    ).toHaveBeenCalledWith('biz_1', 'client_1', payload);
    expect(result.message).toBe(MESSAGING_MESSAGES.SUCCESS.MESSAGE_SENT);
    expect(result.data).toBe(payload);
  });

  it('should mark messages as read and emit message_read to the room', async () => {
    // Arrange
    const user: JwtUserLike = {
      sub: 'user_1',
      businessId: 'biz_1',
    };
    const dto = {
      clientId: 'client_1',
      upToMessageId: 'msg_99',
    };
    const serviceResult = {
      upToMessageId: 'msg_99',
      readAt: new Date('2026-01-01T10:00:00.000Z').toISOString(),
      readBy: 'user_1',
    };
    messagingService.markMessagesReadFromBusiness.mockResolvedValue(
      serviceResult,
    );

    // Act
    const result = await controller.markRead(user as never, dto);

    // Assert
    expect(messagingService.markMessagesReadFromBusiness).toHaveBeenCalledWith({
      businessId: 'biz_1',
      userId: 'user_1',
      clientId: 'client_1',
      upToMessageId: 'msg_99',
    });
    expect(messagingGateway.emitMessageReadToConversation).toHaveBeenCalledWith(
      'biz_1',
      'client_1',
      'msg_99',
      serviceResult.readAt,
      'user_1',
    );
    expect(result.message).toBe(
      MESSAGING_MESSAGES.SUCCESS.MESSAGES_MARKED_READ,
    );
    expect(result.data).toBeNull();
  });

  it('should throw when service returns an HttpException', async () => {
    // Arrange
    messagingService.sendMessageFromBusiness.mockResolvedValue(
      new NotFoundException('not found'),
    );

    // Act & Assert
    await expect(
      controller.sendMessage({ sub: 'user_1', businessId: 'biz_1' } as never, {
        clientId: 'client_1',
        content: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      messagingGateway.emitMessageReceivedToConversation,
    ).not.toHaveBeenCalled();
  });
});
