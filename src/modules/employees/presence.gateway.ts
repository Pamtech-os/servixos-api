import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UseFilters } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsAuthGuard } from 'src/common/guards/ws-auth.guard';
import { WsExceptionFilter } from 'src/common/gateways/ws-exception.filter';
import { RedisService } from '../redis/services/redis.service';
import { EmployeesRepository } from './repositories/employees.repository';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';

export enum PresenceEvent {
  ONLINE_LIST = 'online_list',
  USER_ONLINE = 'user_online',
  USER_OFFLINE = 'user_offline',
}

export interface OnlineUser {
  userId: string;
  employeeId?: string;
  fullName: string;
  initials: string;
  avatarColor: string;
}

const AVATAR_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
];

@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: '/presence' })
export class PresenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PresenceGateway.name);

  constructor(
    private readonly wsAuthGuard: WsAuthGuard,
    private readonly employeesRepository: EmployeesRepository,
    private readonly redis: RedisService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      await this.wsAuthGuard.authenticate(socket);

      const { userId, businessId } = socket.data as {
        userId: string;
        businessId: string;
      };

      const employee = await this.employeesRepository.findByUserId(userId);

      const presence: OnlineUser = {
        userId,
        employeeId: employee?._id?.toString(),
        fullName: employee?.fullName ?? 'Unknown',
        initials: this.getInitials(employee?.fullName),
        avatarColor: this.getAvatarColor(userId),
      };

      await this.redis.hset(
        `presence:${businessId}`,
        userId,
        JSON.stringify(presence),
      );
      await this.redis.expire(`presence:${businessId}`, CACHE_TTL.WS_PRESENCE);

      await socket.join(`presence:${businessId}`);

      socket
        .to(`presence:${businessId}`)
        .emit(PresenceEvent.USER_ONLINE, presence);

      const onlineList = await this.getOnlineList(businessId);
      socket.emit(PresenceEvent.ONLINE_LIST, {
        count: onlineList.length,
        users: onlineList,
      });

      this.logger.log(`Presence connected: ${userId}`);
    } catch {
      // WsAuthGuard already emitted connection_error and disconnected the socket
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const { businessId, userId } = (socket.data ?? {}) as {
      businessId?: string;
      userId?: string;
    };

    if (!businessId || !userId) return;

    await this.redis.hdel(`presence:${businessId}`, userId);

    this.server
      .to(`presence:${businessId}`)
      .emit(PresenceEvent.USER_OFFLINE, { userId });

    this.logger.log(`Presence disconnected: ${userId}`);
  }

  private async getOnlineList(businessId: string): Promise<OnlineUser[]> {
    const hash = await this.redis.hgetall(`presence:${businessId}`);
    return Object.values(hash ?? {}).map((v) => JSON.parse(v) as OnlineUser);
  }

  private getInitials(fullName?: string): string {
    if (!fullName) return '??';
    return fullName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  private getAvatarColor(userId: string): string {
    const idx = parseInt(userId.slice(-2), 16) % AVATAR_COLORS.length;
    return AVATAR_COLORS[idx];
  }
}
