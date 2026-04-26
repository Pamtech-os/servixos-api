import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { ApiResponse } from '../dto/response.dto';

@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<unknown>> {
    const statusCode =
      context.switchToHttp().getResponse<{ statusCode: number }>().statusCode ??
      HttpStatus.OK;

    return next.handle().pipe(
      map((data: unknown) => {
        const payload = typeof data === 'object' && data !== null ? data : {};
        return {
          success: true,
          statusCode,
          ...payload,
        } as ApiResponse<unknown>;
      }),
    );
  }
}
