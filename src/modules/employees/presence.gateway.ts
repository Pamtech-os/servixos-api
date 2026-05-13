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
import {
  getAvatarColor,
  getInitials,
  OnlineUser,
} from './constants/presence.constants';
import { websocketConfig } from 'src/config/websocket.config';

export enum PresenceEvent {
  ONLINE_LIST = 'online_list',
  USER_ONLINE = 'user_online',
  USER_OFFLINE = 'user_offline',
}

@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: '/presence', cors: websocketConfig().cors })
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
        initials: getInitials(employee?.fullName),
        avatarColor: getAvatarColor(userId),
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
}
