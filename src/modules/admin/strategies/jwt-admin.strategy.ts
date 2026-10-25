import type { Request } from 'express';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { COOKIE_NAMES } from 'src/common/constants/cookie.constants';
import type { AdminJwtPayload } from '../types/admin.types';

@Injectable()
export class JwtAdminStrategy extends PassportStrategy(Strategy, 'jwt-admin') {
  constructor(config: ConfigService) {
    super({
      // Admin is web-only — always extract from the a_access_token httpOnly cookie.
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) =>
          (req.cookies?.[COOKIE_NAMES.ADMIN_ACCESS_TOKEN] as
            | string
            | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || '',
      audience: 'admin',
    });
  }

  validate(payload: AdminJwtPayload): AdminJwtPayload {
    if (!payload?.sub || payload.aud !== 'admin') {
      throw new UnauthorizedException(ADMIN_MESSAGES.ERROR.UNAUTHORIZED);
    }
    return payload;
  }
}
