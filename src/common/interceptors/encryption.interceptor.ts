import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { ENCRYPT_KEY } from '../decorators/encrypt.decorator';
import { ApiResponse } from '../dto/response.dto';
import { encrypt } from '../utils/crypto.util';

@Injectable()
export class EncryptionInterceptor implements NestInterceptor {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const shouldEncrypt = this.reflector.getAllAndOverride<boolean>(
      ENCRYPT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Pass through untouched for non-@Encrypt() routes
    if (!shouldEncrypt) return next.handle();

    const secret = this.config.get<string>('ENCRYPTION_SECRET');

    return next.handle().pipe(
      map((response: ApiResponse<unknown>) => {
        if (response?.data === undefined) return response;

        return {
          ...response,
          data: encrypt(JSON.stringify(response.data), secret || ''),
        };
      }),
    );
  }
}
