import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { Socket } from 'socket.io';
import { UserRole } from '../../users/schemas/user.schema';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { UsersRepository } from '../../users/repositories/users.repository';
import { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';

interface ClientWsPayload {
  sub: string;
  businessId: string;
  userRole: UserRole;
  aud?: string | string[];
}

@Injectable()
export class WsJwtClientAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly clientsRepository: ClientsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const socket = context.switchToWs().getClient<Socket>();
    return this.authenticate(socket);
  }

  async authenticate(socket: Socket): Promise<boolean> {
    const authHeader = socket.handshake.headers?.authorization;
    const headerToken =
      typeof authHeader === 'string'
        ? authHeader.replace(/^Bearer\s+/i, '')
        : undefined;
    const token =
      (socket.handshake.auth?.token as string | undefined) || headerToken;

    if (!token) {
      this.rejectSocket(socket, CLIENT_MESSAGES.MESSAGE.ERROR.WS_UNAUTHORIZED);
      return false;
    }

    let payload: ClientWsPayload;
    try {
      payload = this.jwtService.verify<ClientWsPayload>(token, {
        secret:
          this.configService.get<string>('CLIENT_JWT_SECRET') ??
          this.configService.get<string>('JWT_SECRET'),
        audience: 'client',
      });
    } catch {
      this.rejectSocket(socket, CLIENT_MESSAGES.MESSAGE.ERROR.WS_UNAUTHORIZED);
      return false;
    }

    if (
      !payload.sub ||
      !payload.businessId ||
      payload.userRole !== UserRole.CLIENT ||
      !Types.ObjectId.isValid(payload.sub) ||
      !Types.ObjectId.isValid(payload.businessId)
    ) {
      this.rejectSocket(socket, CLIENT_MESSAGES.MESSAGE.ERROR.WS_UNAUTHORIZED);
      return false;
    }

    const [user, client] = await Promise.all([
      this.usersRepository.findById(payload.sub),
      this.clientsRepository.findByUserId(
        new Types.ObjectId(payload.sub),
        new Types.ObjectId(payload.businessId),
      ),
    ]);

    if (
      !user ||
      user.deletedAt ||
      !user.isActive ||
      user.userRole !== UserRole.CLIENT ||
      !client
    ) {
      this.rejectSocket(socket, CLIENT_MESSAGES.MESSAGE.ERROR.WS_UNAUTHORIZED);
      return false;
    }

    const authSocket = socket as AuthenticatedSocket;
    authSocket.data.userId = user._id.toString();
    authSocket.data.businessId = payload.businessId;
    authSocket.data.clientId = client._id.toString();

    return true;
  }

  private rejectSocket(socket: Socket, message: string): void {
    socket.emit('error', { message });
    socket.disconnect(true);
  }
}
