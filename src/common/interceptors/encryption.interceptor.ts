import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { map, Observable } from 'rxjs';
import { ENCRYPT_KEY } from '../decorators/encrypt.decorator';
import { encrypt } from '../utils/crypto.util';

@Injectable()
export class EncryptionInterceptor implements NestInterceptor {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const shouldEncrypt = this.reflector.getAllAndOverride<boolean>(
      ENCRYPT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!shouldEncrypt) return next.handle();

    const request = context
      .switchToHttp()
      .getRequest<Request & { isEncrypted?: boolean }>();
    request.isEncrypted = true;

    const statusCode =
      context.switchToHttp().getResponse<Response>().statusCode ??
      HttpStatus.OK;
    const secret = this.config.get<string>('ENCRYPTION_SECRET') || '';

    return next.handle().pipe(
      map((response: unknown) => {
        const payload =
          typeof response === 'object' && response !== null
            ? (response as Record<string, unknown>)
            : {};
        const { message = '', data: responseData = null, meta } = payload;
        const transformed = {
          success: true,
          statusCode,
          message,
          data: responseData,
          ...(meta !== undefined ? { meta } : {}),
        };
        const encrypted = encrypt(JSON.stringify(transformed), secret);
        return { toJSON: () => encrypted };
      }),
    );
  }
}
