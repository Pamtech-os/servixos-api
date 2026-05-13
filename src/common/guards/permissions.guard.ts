import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AUTH_MESSAGES } from '../constants/messages/auth.messages';
import { JwtUser } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: JwtUser & { permissions?: string[] } }>();

    const hasAll =
      !!user &&
      required.every((perm) => user.permissions?.includes(perm) === true);
    if (!hasAll) throw new ForbiddenException(AUTH_MESSAGES.ERROR.FORBIDDEN);

    return true;
  }
}
