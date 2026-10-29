import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from 'src/modules/users/schemas/user.schema';

export enum TokenScope {
  /** Issued to owners who have verified their email but not yet created a business. */
  ONBOARDING = 'onboarding',
}

export interface JwtUser {
  sub: string;
  /** Empty for ONBOARDING-scoped tokens — TenantGuard blocks those from tenant routes. */
  businessId: string;
  userRole: UserRole;
  pinVerified: boolean;
  permissions?: string[];
  scope?: TokenScope;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtUser }>();
    return request.user;
  },
);
