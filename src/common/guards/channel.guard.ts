import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Channel } from '../enums/channel.enum';
import { SKIP_CHANNEL_KEY } from '../decorators/channel.decorator';
import { CHANNEL_MESSAGES } from '../constants/messages/channel.messages';

// Extend Express Request so downstream code sees req.channel as typed.
declare module 'express' {
  interface Request {
    channel: Channel;
  }
}

const VALID_CHANNELS = new Set<string>(Object.values(Channel));

@Injectable()
export class ChannelGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Only applies to HTTP — WebSocket/RPC contexts are skipped.
    if (context.getType() !== 'http') return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CHANNEL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const raw = req.headers['x-channel'];
    const value = Array.isArray(raw) ? raw[0] : raw;

    if (!value) {
      throw new BadRequestException(CHANNEL_MESSAGES.ERROR.MISSING);
    }

    if (!VALID_CHANNELS.has(value)) {
      throw new BadRequestException(CHANNEL_MESSAGES.ERROR.INVALID);
    }

    req.channel = value as Channel;
    return true;
  }
}
