import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { API_KEY_MESSAGES } from '../constants/messages/api-key.messages';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException(API_KEY_MESSAGES.ERROR.MISSING);
    }

    const validKey = this.config.get<string>('API_KEY');
    if (!validKey || apiKey !== validKey) {
      throw new UnauthorizedException(API_KEY_MESSAGES.ERROR.INVALID);
    }

    return true;
  }
}
