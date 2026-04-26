import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { map, Observable } from 'rxjs';
import { ENCRYPT_KEY } from '../decorators/encrypt.decorator';
import { encrypt } from '../utils/crypto.util';

@Injectable()
export class EncryptionInterceptor implements NestInterceptor {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<string> {
    const shouldEncrypt = this.reflector.getAllAndOverride<boolean>(
      ENCRYPT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!shouldEncrypt) return next.handle() as Observable<string>;

    const request = context
      .switchToHttp()
      .getRequest<Request & { isEncrypted?: boolean }>();
    request.isEncrypted = true;

    const secret = this.config.get<string>('ENCRYPTION_SECRET') || '';

    return next
      .handle()
      .pipe(
        map((response: unknown) => encrypt(JSON.stringify(response), secret)),
      );
  }
}
