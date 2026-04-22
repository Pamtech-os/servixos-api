import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from 'src/common/decorators/current-user.decorator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('JWT_SECRET') || 'change-me-in-production',
    });
  }

  validate(payload: JwtUser & { iat: number; exp: number }): JwtUser {
    if (!payload?.sub) {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.UNAUTHORIZED);
    }
    return {
      sub: payload.sub,
      businessId: payload.businessId,
      userRole: payload.userRole,
      pinVerified: payload.pinVerified,
    };
  }
}
