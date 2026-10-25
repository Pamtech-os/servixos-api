import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Types } from 'mongoose';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { JwtUser } from '../decorators/current-user.decorator';
import { WEBSOCKET_MESSAGES } from '../constants/messages/websocket.messages';
import { CACHE_TTL } from '../constants/cache-ttl.constants';

@Injectable()
export class WsAuthGuard {
  constructor(
    private readonly jwtService: JwtService,
    private readonly businessRepository: BusinessRepository,
    private readonly redis: RedisService,
  ) {}

  async authenticate(socket: Socket): Promise<void> {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      this.rejectSocket(
        socket,
        'MISSING_TOKEN',
        WEBSOCKET_MESSAGES.ERROR.MISSING_TOKEN,
      );
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.MISSING_TOKEN);
    }

    let payload: JwtUser;
    try {
      payload = this.jwtService.verify<JwtUser>(token);
    } catch {
      this.rejectSocket(
        socket,
        'INVALID_TOKEN',
        WEBSOCKET_MESSAGES.ERROR.INVALID_TOKEN,
      );
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.INVALID_TOKEN);
    }

    const businessId = socket.handshake.auth?.businessId as string | undefined;

    if (!businessId || !Types.ObjectId.isValid(businessId)) {
      this.rejectSocket(
        socket,
        'MISSING_BUSINESS_ID',
        WEBSOCKET_MESSAGES.ERROR.MISSING_BUSINESS_ID,
      );
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.MISSING_BUSINESS_ID);
    }

    if (payload.businessId !== businessId) {
      this.rejectSocket(
        socket,
        'TENANT_MISMATCH',
        WEBSOCKET_MESSAGES.ERROR.TENANT_MISMATCH,
      );
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.TENANT_MISMATCH);
    }

    const cachedBusiness = await this.redis.get(`business:${businessId}`);
    let business: { deletedAt?: Date | null } | null = null;

    if (cachedBusiness) {
      business = JSON.parse(cachedBusiness) as { deletedAt?: Date | null };
    } else {
      business = await this.businessRepository.findById(businessId);
      if (business) {
        await this.redis.set(
          `business:${businessId}`,
          JSON.stringify(business),
          CACHE_TTL.TENANT_VALIDATION,
        );
      }
    }

    if (!business || business.deletedAt) {
      this.rejectSocket(
        socket,
        'BUSINESS_NOT_FOUND',
        WEBSOCKET_MESSAGES.ERROR.BUSINESS_NOT_FOUND,
      );
      throw new WsException(WEBSOCKET_MESSAGES.ERROR.BUSINESS_NOT_FOUND);
    }

    const data = socket.data as {
      userId: string;
      businessId: string;
      userRole: string;
    };
    data.userId = payload.sub;
    data.businessId = businessId;
    data.userRole = payload.userRole;
  }

  private rejectSocket(socket: Socket, code: string, message: string): void {
    socket.emit('connection_error', { code, message });
    socket.disconnect(true);
  }
}
