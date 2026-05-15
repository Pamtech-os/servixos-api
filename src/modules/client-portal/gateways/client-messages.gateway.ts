import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { HttpException, Logger, UseGuards, UseFilters } from '@nestjs/common';
import { Server } from 'socket.io';
import { MESSAGE_EVENTS } from 'src/client/constants/ws-events';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { WsExceptionFilter } from 'src/common/gateways/ws-exception.filter';
import { WsEvent } from '../../messaging/messaging.events';
import { WsConversationRoomDto } from '../dto/ws-conversation-room.dto';
import { WsSendMessageDto } from '../dto/ws-send-message.dto';
import { WsJwtClientAuthGuard } from '../guards/ws-jwt-client-auth.guard';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';
import { ClientMessagesService } from '../services/client-messages.service';
import { websocketConfig } from 'src/config/websocket.config';

@WebSocketGateway({
  namespace: '/client-messages',
  cors: websocketConfig().cors,
})
@UseFilters(WsExceptionFilter)
@UseGuards(WsJwtClientAuthGuard)
export class ClientMessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ClientMessagesGateway.name);

  constructor(
    private readonly messagesService: ClientMessagesService,
    private readonly authGuard: WsJwtClientAuthGuard,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const authenticated = await this.authGuard.authenticate(client);
    if (!authenticated) return;

    try {
      await client.join(client.data.clientId);
    } catch {
      return;
    }

    client.emit(MESSAGE_EVENTS.CONNECTED, {
      clientId: client.data.clientId,
      message: 'Connected',
    });

    this.logger.log(
      `Client socket connected [clientId=${client.data.clientId}]`,
    );
  }

  async handleDisconnect(_client: AuthenticatedSocket): Promise<void> {}

  @SubscribeMessage(MESSAGE_EVENTS.JOIN_CONVERSATION)
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsConversationRoomDto,
  ): Promise<void> {
    const roomId = buildRoomId(client.data.clientId, payload.providerId);
    await client.join(roomId);
  }

  @SubscribeMessage(MESSAGE_EVENTS.LEAVE_CONVERSATION)
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsConversationRoomDto,
  ): Promise<void> {
    await client.leave(buildRoomId(client.data.clientId, payload.providerId));
  }

  @SubscribeMessage(MESSAGE_EVENTS.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsSendMessageDto,
  ): Promise<void> {
    const roomId = buildRoomId(client.data.clientId, payload.providerId);
    if (!client.rooms.has(roomId)) {
      client.emit(MESSAGE_EVENTS.ERROR, {
        message: CLIENT_MESSAGES.MESSAGE.ERROR.WS_ROOM_NOT_FOUND,
      });
      return;
    }

    const message = await this.messagesService.sendMessage(
      client.data.businessId,
      client.data.clientId,
      payload.providerId,
      payload.content,
    );
    if (message instanceof HttpException) throw message;

    this.server
      .to(roomId)
      .emit(MESSAGE_EVENTS.NEW_MESSAGE, message.clientMessage);

    // Bridge client-sent messages to the business chat namespace so staff
    // sockets receive the same real-time updates without polling.
    this.server
      .of?.('/chat')
      ?.to(`${client.data.businessId}:${client.data.clientId}`)
      .emit(WsEvent.MESSAGE_RECEIVED, { message: message.rawMessage });

    const conversation = await this.messagesService.getConversationSummary(
      client.data.businessId,
      client.data.clientId,
      payload.providerId,
    );
    if (conversation instanceof HttpException) throw conversation;

    this.server
      .to(client.data.clientId)
      .emit(MESSAGE_EVENTS.CONVERSATION_UPDATED, conversation);
  }

  @SubscribeMessage(MESSAGE_EVENTS.MARK_READ)
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsConversationRoomDto,
  ): Promise<void> {
    await this.messagesService.markConversationAsRead(
      client.data.businessId,
      client.data.clientId,
      payload.providerId,
    );

    await this.emitConversationRead(
      client.data.businessId,
      client.data.clientId,
      payload.providerId,
    );
  }

  @SubscribeMessage(MESSAGE_EVENTS.TYPING_START)
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsConversationRoomDto,
  ): void {
    client
      .to(buildRoomId(client.data.clientId, payload.providerId))
      .emit(MESSAGE_EVENTS.TYPING, {
        clientId: client.data.clientId,
        isTyping: true,
      });
  }

  @SubscribeMessage(MESSAGE_EVENTS.TYPING_STOP)
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsConversationRoomDto,
  ): void {
    client
      .to(buildRoomId(client.data.clientId, payload.providerId))
      .emit(MESSAGE_EVENTS.TYPING, {
        clientId: client.data.clientId,
        isTyping: false,
      });
  }

  async emitConversationRead(
    businessId: string,
    clientId: string,
    providerId: string,
  ): Promise<void> {
    const roomId = buildRoomId(clientId, providerId);
    this.server.to(roomId).emit(MESSAGE_EVENTS.MESSAGE_READ, {
      clientId,
      providerId,
    });

    const conversation = await this.messagesService.getConversationSummary(
      businessId,
      clientId,
      providerId,
    );

    this.server
      .to(clientId)
      .emit(MESSAGE_EVENTS.CONVERSATION_UPDATED, conversation);
  }
}

export function buildRoomId(clientId: string, providerId: string): string {
  return `client-conversation:${clientId}:${providerId}`;
}

export interface ClientReadEventPayload {
  businessId: string;
  clientId: string;
  providerId: string;
}
