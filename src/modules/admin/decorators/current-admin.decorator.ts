import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminJwtPayload } from '../types/admin.types';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminJwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: AdminJwtPayload }>();
    return request.user;
  },
);
