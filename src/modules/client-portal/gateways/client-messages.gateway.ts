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
import { WsEvent, clientPresenceKey } from '../../messaging/messaging.events';
import { WsConversationRoomDto } from '../dto/ws-conversation-room.dto';
import { WsSendMessageDto } from '../dto/ws-send-message.dto';
import { WsJwtClientAuthGuard } from '../guards/ws-jwt-client-auth.guard';
import type { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';
import { ClientMessagesService } from '../services/client-messages.service';
import { RedisService } from '../../redis/services/redis.service';
import { websocketConfig } from 'src/config/websocket.config';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';

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
    private readonly redis: RedisService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const authenticated = await this.authGuard.authenticate(client);
    if (!authenticated) return;

    try {
      await client.join(client.data.clientId);
    } catch {
      return;
    }

    const { clientId, businessId } = client.data;

    await this.redis.sadd(clientPresenceKey(businessId), clientId);
    await this.redis.expire(
      clientPresenceKey(businessId),
      CACHE_TTL.WS_PRESENCE,
    );

    this.server
      .of?.('/chat')
      ?.to(`${businessId}:${clientId}`)
      .emit(WsEvent.CLIENT_ONLINE, { clientId });

    client.emit(MESSAGE_EVENTS.CONNECTED, {
      clientId,
      message: 'Connected',
    });

    this.logger.log(`Client socket connected [clientId=${clientId}]`);
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const { clientId, businessId } = client.data ?? {};
    if (!clientId || !businessId) return;

    await this.redis.srem(clientPresenceKey(businessId), clientId);

    this.server
      .of?.('/chat')
      ?.to(`${businessId}:${clientId}`)
      .emit(WsEvent.CLIENT_OFFLINE, { clientId });

    this.logger.log(`Client socket disconnected [clientId=${clientId}]`);
  }

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
    const { clientId, businessId } = client.data;

    client
      .to(buildRoomId(clientId, payload.providerId))
      .emit(MESSAGE_EVENTS.TYPING, { clientId, isTyping: true });

    this.server
      .of?.('/chat')
      ?.to(`${businessId}:${clientId}`)
      .emit(WsEvent.CLIENT_TYPING, { clientId });
  }

  @SubscribeMessage(MESSAGE_EVENTS.TYPING_STOP)
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsConversationRoomDto,
  ): void {
    const { clientId, businessId } = client.data;

    client
      .to(buildRoomId(clientId, payload.providerId))
      .emit(MESSAGE_EVENTS.TYPING, { clientId, isTyping: false });

    this.server
      .of?.('/chat')
      ?.to(`${businessId}:${clientId}`)
      .emit(WsEvent.CLIENT_STOPPED_TYPING, { clientId });
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
