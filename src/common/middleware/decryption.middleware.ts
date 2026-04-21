import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { NextFunction } from 'express';
import { ENCRYPT_KEY } from '../decorators/encrypt.decorator';
import { COMMON_MESSAGES } from '../constants/messages/common.messages';
import { decrypt, EncryptedEnvelope } from '../utils/crypto.util';
import { Request } from 'express';

@Injectable()
export class DecryptionMiddleware implements NestMiddleware {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  use(req: Request, _res: Response, next: NextFunction) {
    // Only decrypt when the matched route is decorated with @Encrypt()
    type RouteHandler = (...args: unknown[]) => unknown;
    const routeHandler = (req.route as { handler?: RouteHandler } | undefined)
      ?.handler;
    const shouldDecrypt = this.reflector.get<boolean>(
      ENCRYPT_KEY,
      routeHandler as RouteHandler,
    );

    if (!shouldDecrypt || !(req.body as Record<string, unknown>)?.payload) {
      return next();
    }

    try {
      const secret = this.config.get<string>('ENCRYPTION_SECRET') || '';
      const plaintext = decrypt(req.body as EncryptedEnvelope, secret);
      req.body = JSON.parse(plaintext) as Record<string, unknown>;
    } catch {
      throw new BadRequestException(COMMON_MESSAGES.ERROR.BAD_REQUEST);
    }

    next();
  }
}
