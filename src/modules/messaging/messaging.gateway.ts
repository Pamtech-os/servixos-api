import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UseFilters } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import { WsAuthGuard } from 'src/common/guards/ws-auth.guard';
import { WsExceptionFilter } from 'src/common/gateways/ws-exception.filter';
import { RedisService } from '../redis/services/redis.service';
import { EmployeesRepository } from '../employees/repositories/employees.repository';
import { MessagingService } from './services/messaging.service';
import { WsEvent, MessagePayload, teamRoom } from './messaging.events';
import type {
  AnnouncementView,
  TeamMessageView,
} from './services/messaging.service';
import { Message, MessageSender } from './schemas/message.schema';
import { WEBSOCKET_MESSAGES } from 'src/common/constants/messages/websocket.messages';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { websocketConfig } from 'src/config/websocket.config';

const MAX_CONTENT_LENGTH = 5000;

interface JoinRoomPayload {
  clientId: string;
}
interface SendMessagePayload {
  clientId: string;
  content?: string;
  attachmentUrl?: string;
  publicId?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
}
interface TypingPayload {
  clientId: string;
}
interface MarkReadPayload {
  clientId: string;
  upToMessageId: string;
}
interface EditMessagePayload {
  messageId: string;
  content: string;
}
interface DeleteMessagePayload {
  messageId: string;
}

@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: '/chat', cors: websocketConfig().cors })
export class MessagingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagingGateway.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly wsAuthGuard: WsAuthGuard,
    private readonly redis: RedisService,
    private readonly employeesRepository: EmployeesRepository,
  ) {}

  emitTeamMessage(businessId: string, message: TeamMessageView): void {
    this.server
      .to(teamRoom(businessId))
      .emit(WsEvent.TEAM_MESSAGE_SENT, { message });
  }

  emitAnnouncement(businessId: string, announcement: AnnouncementView): void {
    this.server
      .to(teamRoom(businessId))
      .emit(WsEvent.ANNOUNCEMENT_CREATED, { announcement });
  }

  emitMessageReceivedToConversation(
    businessId: string,
    clientId: string,
    message: MessagePayload,
  ): void {
    this.server
      .to(`${businessId}:${clientId}`)
      .emit(WsEvent.MESSAGE_RECEIVED, { message });
  }

  emitMessageReadToConversation(
    businessId: string,
    clientId: string,
    upToMessageId: string,
    readAt: string,
    readBy: string,
  ): void {
    this.server.to(`${businessId}:${clientId}`).emit(WsEvent.MESSAGE_READ, {
      upToMessageId,
      readAt,
      readBy,
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    try {
      await this.wsAuthGuard.authenticate(socket);

      const { userId, businessId } = socket.data as {
        userId: string;
        businessId: string;
      };

      // Resolve display name — employee lookup first, fall back to 'Business'
      const employee = await this.employeesRepository.findByUserId(userId);
      (socket.data as { senderName: string }).senderName =
        employee?.fullName ?? 'Business';

      // Auto-join the business-wide team room so staff receive team messages
      // and announcements without any explicit client-side join call.
      await socket.join(teamRoom(businessId));

      await this.redis.sadd(`presence:chat:${businessId}`, userId);
      await this.redis.expire(
        `presence:chat:${businessId}`,
        CACHE_TTL.WS_PRESENCE,
      );

      socket.emit(WsEvent.CONNECTED, { socketId: socket.id, userId });
      this.logger.log(`Chat connected: ${socket.id} (user: ${userId})`);
    } catch {
      // WsAuthGuard already emitted connection_error and disconnected
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const { businessId, userId } = (socket.data ?? {}) as {
      businessId?: string;
      userId?: string;
    };
    if (!businessId || !userId) return;

    await this.redis.srem(`presence:chat:${businessId}`, userId);
    this.logger.log(`Chat disconnected: ${socket.id} (user: ${userId})`);
  }

  // ─── join_room ──────────────────────────────────────────────────────────────

  @SubscribeMessage(WsEvent.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ): Promise<void> {
    const { userId, businessId } = socket.data as {
      userId: string;
      businessId: string;
    };

    if (!payload?.clientId || !Types.ObjectId.isValid(payload.clientId)) {
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.INVALID_CLIENT_ID);
    }

    const room = `${businessId}:${payload.clientId}`;
    await socket.join(room);

    await this.messagingService.setRoomActive(
      businessId,
      payload.clientId,
      true,
    );

    const history = await this.messagingService.getRecentMessages(
      businessId,
      payload.clientId,
      20,
    );

    socket.emit(WsEvent.ROOM_JOINED, {
      room,
      history: history
        .reverse()
        .map((m) =>
          this.messagingService.toPayload(m as Message & { createdAt?: Date }),
        ),
    });

    this.logger.log(`User ${userId} joined room ${room}`);
  }

  // ─── leave_room ─────────────────────────────────────────────────────────────

  @SubscribeMessage(WsEvent.LEAVE_ROOM)
  async handleLeaveRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ): Promise<void> {
    const { businessId } = socket.data as { businessId: string };

    if (!payload?.clientId || !Types.ObjectId.isValid(payload.clientId)) {
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.INVALID_CLIENT_ID);
    }

    const room = `${businessId}:${payload.clientId}`;
    await socket.leave(room);
    await this.messagingService.setRoomActive(
      businessId,
      payload.clientId,
      false,
    );
  }

  // ─── send_message ────────────────────────────────────────────────────────────

  @SubscribeMessage(WsEvent.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SendMessagePayload,
    callback?: (ack: {
      success: boolean;
      messageId?: string;
      error?: string;
    }) => void,
  ): Promise<void> {
    const { userId, businessId, senderName } = socket.data as {
      userId: string;
      businessId: string;
      senderName: string;
    };

    if (!payload?.clientId || !Types.ObjectId.isValid(payload.clientId)) {
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.INVALID_CLIENT_ID);
    }

    if (!payload.content && !payload.attachmentUrl) {
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.EMPTY_CONTENT);
    }

    if (payload.content && payload.content.length > MAX_CONTENT_LENGTH) {
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.CONTENT_TOO_LONG);
    }

    const room = `${businessId}:${payload.clientId}`;
    if (!socket.rooms.has(room)) {
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.ROOM_NOT_JOINED);
    }

    const message = await this.messagingService.createMessage({
      businessId,
      clientId: payload.clientId,
      sender: MessageSender.BUSINESS,
      senderName: senderName ?? 'Business',
      content: payload.content,
      attachmentUrl: payload.attachmentUrl,
      publicId: payload.publicId,
      mimeType: payload.mimeType,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
    });

    const messagePayload: MessagePayload = this.messagingService.toPayload(
      message as Message & { createdAt?: Date },
    );

    // Broadcast to all sockets in the room (including sender)
    this.emitMessageReceivedToConversation(
      businessId,
      payload.clientId,
      messagePayload,
    );

    // Mark as delivered and notify sender
    await this.messagingService.markDelivered(message._id);
    socket.emit(WsEvent.MESSAGE_DELIVERED, {
      messageId: messagePayload.id,
      deliveredAt: new Date().toISOString(),
    });

    if (callback) callback({ success: true, messageId: messagePayload.id });

    void userId; // acknowledged via MESSAGE_DELIVERED above
  }

  // ─── typing ─────────────────────────────────────────────────────────────────

  @SubscribeMessage(WsEvent.TYPING_START)
  handleTypingStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: TypingPayload,
  ): void {
    const { userId, businessId, senderName } = socket.data as {
      userId: string;
      businessId: string;
      senderName: string;
    };
    if (!payload?.clientId || !Types.ObjectId.isValid(payload.clientId)) return;

    socket
      .to(`${businessId}:${payload.clientId}`)
      .emit(WsEvent.USER_TYPING, { userId, senderName });
  }

  @SubscribeMessage(WsEvent.TYPING_STOP)
  handleTypingStop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: TypingPayload,
  ): void {
    const { userId, businessId } = socket.data as {
      userId: string;
      businessId: string;
    };
    if (!payload?.clientId || !Types.ObjectId.isValid(payload.clientId)) return;

    socket
      .to(`${businessId}:${payload.clientId}`)
      .emit(WsEvent.USER_STOPPED_TYPING, { userId });
  }

  // ─── mark_read ───────────────────────────────────────────────────────────────

  @SubscribeMessage(WsEvent.MARK_READ)
  async handleMarkRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: MarkReadPayload,
  ): Promise<void> {
    const { userId, businessId } = socket.data as {
      userId: string;
      businessId: string;
    };

    if (!payload?.clientId || !Types.ObjectId.isValid(payload.clientId)) {
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.INVALID_CLIENT_ID);
    }
    if (
      !payload.upToMessageId ||
      !Types.ObjectId.isValid(payload.upToMessageId)
    ) {
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.INTERNAL);
    }

    const readAt = await this.messagingService.markRead({
      businessId,
      clientId: payload.clientId,
      upToMessageId: payload.upToMessageId,
      readerSender: MessageSender.BUSINESS,
    });

    this.emitMessageReadToConversation(
      businessId,
      payload.clientId,
      payload.upToMessageId,
      readAt.toISOString(),
      userId,
    );
  }

  // ─── edit_message ────────────────────────────────────────────────────────────

  @SubscribeMessage(WsEvent.EDIT_MESSAGE)
  async handleEditMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: EditMessagePayload,
  ): Promise<void> {
    const { businessId } = socket.data as { businessId: string };

    if (!payload?.messageId || !Types.ObjectId.isValid(payload.messageId)) {
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.INTERNAL);
    }
    if (!payload.content || payload.content.length > MAX_CONTENT_LENGTH) {
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.EMPTY_CONTENT);
    }

    const message = await this.messagingService.editMessage({
      messageId: payload.messageId,
      businessId,
      sender: MessageSender.BUSINESS,
      content: payload.content,
    });

    this.server
      .to(`${businessId}:${message.clientId.toString()}`)
      .emit(WsEvent.MESSAGE_EDITED, {
        messageId: payload.messageId,
        content: payload.content,
        editedAt: new Date().toISOString(),
      });
  }

  // ─── delete_message ──────────────────────────────────────────────────────────

  @SubscribeMessage(WsEvent.DELETE_MESSAGE)
  async handleDeleteMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: DeleteMessagePayload,
  ): Promise<void> {
    const { businessId } = socket.data as { businessId: string };

    if (!payload?.messageId || !Types.ObjectId.isValid(payload.messageId)) {
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.INTERNAL);
    }

    const message = await this.messagingService.deleteMessage({
      messageId: payload.messageId,
      businessId,
      sender: MessageSender.BUSINESS,
    });

    this.server
      .to(`${businessId}:${message.clientId.toString()}`)
      .emit(WsEvent.MESSAGE_DELETED, {
        messageId: payload.messageId,
        deletedAt: new Date().toISOString(),
      });
  }
}
