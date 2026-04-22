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
        if (this.isApiResponse(data)) return data as ApiResponse<unknown>;
        return {
          success: true,
          statusCode,
          message: 'OK',
          data,
        } as ApiResponse<unknown>;
      }),
    );
  }

  private isApiResponse(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      'success' in value &&
      'statusCode' in value &&
      'message' in value
    );
  }
}
