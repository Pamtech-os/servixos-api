import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request } from 'express';
import { COMMON_MESSAGES } from '../constants/messages/common.messages';
import { decrypt, EncryptedRequest } from '../utils/crypto.util';

@Injectable()
export class DecryptionMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const payload = (req.body as Partial<EncryptedRequest>)?.payload;

    if (typeof payload !== 'string') {
      return next();
    }

    (req as Request & { isEncrypted: boolean }).isEncrypted = true;

    try {
      const secret = this.config.get<string>('ENCRYPTION_SECRET') || '';
      req.body = JSON.parse(decrypt(payload, secret)) as Record<
        string,
        unknown
      >;
    } catch {
      throw new BadRequestException(COMMON_MESSAGES.ERROR.BAD_REQUEST);
    }

    next();
  }
}
