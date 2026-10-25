import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from 'src/modules/users/schemas/user.schema';

export interface JwtUser {
  sub: string;
  businessId: string;
  userRole: UserRole;
  pinVerified: boolean;
  permissions?: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtUser }>();
    return request.user;
  },
);
