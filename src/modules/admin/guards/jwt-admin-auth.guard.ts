import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';

@Injectable()
export class JwtAdminAuthGuard extends AuthGuard('jwt-admin') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error, user: TUser): TUser {
    if (err || !user) {
      throw new UnauthorizedException(ADMIN_MESSAGES.ERROR.UNAUTHORIZED);
    }
    return user;
  }
}
