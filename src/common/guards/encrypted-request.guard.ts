import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ENCRYPT_KEY } from '../decorators/encrypt.decorator';
import { COMMON_MESSAGES } from '../constants/messages/common.messages';

@Injectable()
export class EncryptedRequestGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresEncryption = this.reflector.getAllAndOverride<boolean>(
      ENCRYPT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiresEncryption) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { isEncrypted?: boolean }>();

    if (!req.isEncrypted) {
      throw new BadRequestException(
        COMMON_MESSAGES.ERROR.PAYLOAD_ENCRYPTION_REQUIRED,
      );
    }

    return true;
  }
}
