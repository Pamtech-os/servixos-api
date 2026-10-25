import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AUTH_MESSAGES } from '../constants/messages/auth.messages';
import { JwtUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { isInternalStaffRole } from '../utils/user-role.util';

@Injectable()
export class PinVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtUser }>();
    const user = req.user;

    if (!user) return true;
    if (!isInternalStaffRole(user.userRole)) return true;
    if (user.pinVerified) return true;

    throw new UnauthorizedException(AUTH_MESSAGES.ERROR.PIN_NOT_VERIFIED);
  }
}
