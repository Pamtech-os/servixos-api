import { Types } from 'mongoose';
import {
  MessagePayload,
  WsEvent,
} from 'src/modules/messaging/messaging.events';
import { MessagingGateway } from 'src/modules/messaging/messaging.gateway';
import { MessagingController } from 'src/modules/messaging/controllers/messaging.controller';
import {
  MessageSender,
  MessageStatus,
} from 'src/modules/messaging/schemas/message.schema';
import type { Message } from 'src/modules/messaging/schemas/message.schema';

describe('Messaging REST/WS parity', () => {
  let gateway: MessagingGateway;
  let controller: MessagingController;
  let messagingService: {
    createMessage: jest.Mock;
    toPayload: jest.Mock;
    markDelivered: jest.Mock;
    sendMessageFromBusiness: jest.Mock;
  };

  beforeEach(() => {
    messagingService = {
      createMessage: jest.fn(),
      toPayload: jest.fn(),
      markDelivered: jest.fn(),
      sendMessageFromBusiness: jest.fn(),
    };

    gateway = new MessagingGateway(
      messagingService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    controller = new MessagingController(
      messagingService as never,
      gateway as never,
    );
  });

  it('should emit identical message_received payload for WS and REST sends', async () => {
    // Arrange
    const businessId = new Types.ObjectId().toString();
    const clientId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const room = `${businessId}:${clientId}`;

    const emitted: Array<{ event: WsEvent; payload: unknown }> = [];
    const emit = jest.fn((event: WsEvent, payload: unknown) => {
      emitted.push({ event, payload });
    });
    const to = jest.fn(() => ({ emit }));
    gateway.server = { to } as never;

    const wsMessage = {
      _id: new Types.ObjectId(),
      conversationId: new Types.ObjectId(),
      businessId: new Types.ObjectId(businessId),
      clientId: new Types.ObjectId(clientId),
      sender: MessageSender.BUSINESS,
      senderName: 'Business',
      content: 'Your invoice is ready.',
      status: MessageStatus.SENT,
      createdAt: new Date('2026-04-16T10:00:00.000Z'),
    } as Message & { createdAt: Date };

    const expectedPayload: MessagePayload = {
      id: wsMessage._id.toString(),
      conversationId: wsMessage.conversationId.toString(),
      businessId,
      clientId,
      sender: MessageSender.BUSINESS,
      senderName: 'Business',
      content: 'Your invoice is ready.',
      status: MessageStatus.SENT,
      createdAt: wsMessage.createdAt.toISOString(),
    };

    messagingService.createMessage.mockResolvedValue(wsMessage);
    messagingService.toPayload.mockReturnValue(expectedPayload);
    messagingService.markDelivered.mockResolvedValue(undefined);
    messagingService.sendMessageFromBusiness.mockResolvedValue(expectedPayload);

    const socket = {
      data: { userId, businessId, senderName: 'Business' },
      rooms: new Set([room]),
      emit: jest.fn(),
    };

    // Act 1: WebSocket send path
    await gateway.handleSendMessage(socket as never, {
      clientId,
      content: 'Your invoice is ready.',
    });

    const wsEmission = emitted.find(
      (entry) => entry.event === WsEvent.MESSAGE_RECEIVED,
    );

    // Reset capture buffer for REST path
    emitted.length = 0;

    // Act 2: REST send path
    const restResponse = await controller.sendMessage(
      { sub: userId, businessId } as never,
      { clientId, content: 'Your invoice is ready.' },
    );

    const restEmission = emitted.find(
      (entry) => entry.event === WsEvent.MESSAGE_RECEIVED,
    );

    // Assert
    expect(restResponse.data).toEqual(expectedPayload);
    expect(wsEmission).toEqual({
      event: WsEvent.MESSAGE_RECEIVED,
      payload: { message: expectedPayload },
    });
    expect(restEmission).toEqual({
      event: WsEvent.MESSAGE_RECEIVED,
      payload: { message: expectedPayload },
    });
  });
});
