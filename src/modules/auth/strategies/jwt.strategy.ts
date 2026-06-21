import type { Request } from 'express';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from 'src/common/decorators/current-user.decorator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { COOKIE_NAMES } from 'src/common/constants/cookie.constants';
import { Channel } from 'src/common/enums/channel.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // web  → httpOnly cookie only (JS cannot access it)
      // mobile → Authorization Bearer header only
      // Unset channel means ChannelGuard rejected the request before this runs,
      // so the fallback to Bearer is only a defensive measure.
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          if (req.channel === Channel.WEB) {
            return (
              (req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN] as
                | string
                | undefined) ?? null
            );
          }
          return null;
        },
        (req: Request) => {
          if (req.channel !== Channel.WEB) {
            return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
          }
          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || '',
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
      permissions: payload.permissions,
    };
  }
}
