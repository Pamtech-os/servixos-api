import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Channel } from '../enums/channel.enum';

export const SKIP_CHANNEL_KEY = 'skipChannel';

/** Apply to a controller class or route handler to skip the ChannelGuard. */
export const SkipChannel = () => SetMetadata(SKIP_CHANNEL_KEY, true);

/** Injects the resolved Channel ('web' | 'mobile') from the request. */
export const CurrentChannel = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Channel => {
    const req = ctx.switchToHttp().getRequest<Request & { channel: Channel }>();
    return req.channel;
  },
);
