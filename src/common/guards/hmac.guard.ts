import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { SKIP_SIGNATURE_KEY } from '../decorators/skip-signature.decorator';
import { API_KEY_MESSAGES } from '../constants/messages/api-key.messages';
import { COMMON_MESSAGES } from '../constants/messages/common.messages';

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1_000;

@Injectable()
export class HmacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SIGNATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request>();

    const clientToken = req.headers['x-client-token'] as string | undefined;
    const timestamp = req.headers['x-timestamp'] as string | undefined;
    const signature = req.headers['x-signature'] as string | undefined;

    if (!clientToken || !timestamp || !signature) {
      throw new UnauthorizedException(API_KEY_MESSAGES.ERROR.MISSING);
    }

    // Replay protection: reject stale or future-dated timestamps
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) {
      throw new UnauthorizedException(API_KEY_MESSAGES.ERROR.INVALID);
    }

    // Verify the client token exists and hasn't expired
    let stored: string | null;
    try {
      stored = await this.redisService.get(`client_token:${clientToken}`);
    } catch {
      throw new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
    if (!stored) {
      throw new UnauthorizedException(API_KEY_MESSAGES.ERROR.EXPIRED);
    }

    // Build the canonical string — must match client-side computation exactly:
    //   METHOD\nPATH\nTIMESTAMP\nBODY
    // where BODY is JSON.stringify(requestBody) or '' for bodyless requests.
    const bodyStr =
      req.body && Object.keys(req.body as object).length > 0
        ? JSON.stringify(req.body)
        : '';
    const canonical = [req.method, req.originalUrl, timestamp, bodyStr].join(
      '\n',
    );

    const expected = createHmac('sha256', clientToken)
      .update(canonical)
      .digest('hex');

    // timingSafeEqual prevents timing-based side-channel attacks
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException(API_KEY_MESSAGES.ERROR.INVALID);
    }

    // Internal sanity-check: API_KEY must be configured on the server
    if (!this.config.get<string>('API_KEY')) {
      throw new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }

    return true;
  }
}
