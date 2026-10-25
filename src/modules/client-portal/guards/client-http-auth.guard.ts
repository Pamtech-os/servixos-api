import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { COOKIE_NAMES } from 'src/common/constants/cookie.constants';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { CLIENT_AUTH_MESSAGES } from 'src/common/constants/messages/client-auth.messages';
import { JwtUser } from 'src/common/decorators/current-user.decorator';
import { Channel } from 'src/common/enums/channel.enum';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { UsersRepository } from '../../users/repositories/users.repository';
import { UserRole } from '../../users/schemas/user.schema';
import { ClientRequest } from '../interfaces/client-request.interface';

@Injectable()
export class ClientHttpAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersRepository: UsersRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly businessRepository: BusinessRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ClientRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(CLIENT_AUTH_MESSAGES.ERROR.UNAUTHORIZED);
    }

    let payload: JwtUser & { aud?: string | string[] };
    try {
      payload = this.jwtService.verify<JwtUser & { aud?: string | string[] }>(
        token,
      );
    } catch {
      throw new UnauthorizedException(CLIENT_AUTH_MESSAGES.ERROR.EXPIRED_TOKEN);
    }

    if (
      !payload?.sub ||
      !payload.businessId ||
      payload.userRole !== UserRole.CLIENT ||
      !this.hasClientAudience(payload.aud)
    ) {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.UNAUTHORIZED);
    }

    if (
      !Types.ObjectId.isValid(payload.sub) ||
      !Types.ObjectId.isValid(payload.businessId)
    ) {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.UNAUTHORIZED);
    }

    const [user, business, client] = await Promise.all([
      this.usersRepository.findById(payload.sub),
      this.businessRepository.findById(payload.businessId),
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
      !business ||
      business.deletedAt ||
      !client
    ) {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.UNAUTHORIZED);
    }

    request.clientUser = {
      userId: user._id.toString(),
      businessId: business._id.toString(),
      clientId: client._id.toString(),
      email: user.email,
    };

    return true;
  }

  /**
   * web    → httpOnly cookie only (JS cannot access it)
   * mobile → Authorization Bearer header only
   */
  private extractToken(request: ClientRequest): string | null {
    if (request.channel === Channel.WEB) {
      return (
        (request.cookies?.[COOKIE_NAMES.CLIENT_ACCESS_TOKEN] as
          | string
          | undefined) ?? null
      );
    }

    return this.extractBearerToken(request.headers.authorization);
  }

  private extractBearerToken(authorization?: string): string | null {
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/);
    if (!scheme || !token) return null;
    if (scheme.toLowerCase() !== 'bearer') return null;

    return token;
  }

  private hasClientAudience(audience: string | string[] | undefined): boolean {
    if (!audience) return false;
    if (typeof audience === 'string') return audience === 'client';
    return audience.includes('client');
  }
}
