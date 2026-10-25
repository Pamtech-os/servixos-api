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
    const request = ctx.getRequest<
      Request & { isEncrypted?: boolean; method: string; url: string }
    >();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = COMMON_MESSAGES.ERROR.INTERNAL;

    const context = `${request.method} ${request.url}`;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const raw = exceptionResponse as Record<string, unknown>;
        if (typeof raw['message'] === 'string') {
          message = raw['message'];
        } else if (Array.isArray(raw['message'])) {
          message = (raw['message'] as string[]).join('; ');
        }
      }

      // Body-parser JSON SyntaxErrors surface as 400 HttpExceptions whose
      // message contains the raw input — sanitize before sending to the client.
      if (this.isBodyParserError(message)) {
        this.logger.warn(`[${context}] Malformed JSON body rejected`);
        message = COMMON_MESSAGES.ERROR.BAD_REQUEST;
      } else if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `[${context}] ${statusCode} — ${exception.message}`,
          exception.stack,
        );
      }
    } else {
      this.logger.error(
        `[${context}] Unhandled exception`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiResponse<null> = {
      success: false,
      statusCode,
      message,
    };

    if (request.isEncrypted) {
      const secret = this.config.get<string>('ENCRYPTION_SECRET') || '';
      response.status(statusCode).json(encrypt(JSON.stringify(body), secret));
    } else {
      response.status(statusCode).json(body);
    }
  }

  private isBodyParserError(message: string): boolean {
    return (
      message.startsWith('Unexpected token') ||
      message.startsWith('Unexpected end of JSON') ||
      message.startsWith('JSON Parse error')
    );
  }
}
