import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { COMMON_MESSAGES } from '../constants/messages/common.messages';
import { ApiResponse } from '../dto/response.dto';
import { encrypt } from '../utils/crypto.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = COMMON_MESSAGES.ERROR.INTERNAL;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const body = exceptionResponse as Record<string, unknown>;
        if (typeof body['message'] === 'string') {
          message = body['message'];
        } else if (Array.isArray(body['message'])) {
          message = (body['message'] as string[]).join('; ');
        }
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiResponse<null> = {
      success: false,
      statusCode,
      message,
    };

    const secret = this.config.get<string>('ENCRYPTION_SECRET') || '';
    response.status(statusCode).json(encrypt(JSON.stringify(body), secret));
  }
}
