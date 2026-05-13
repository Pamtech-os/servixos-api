import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { JwtUser } from 'src/common/decorators/current-user.decorator';
import { PinVerifiedGuard } from 'src/common/guards/pin-verified.guard';
import { UserRole } from 'src/modules/users/schemas/user.schema';

function contextWithUser(user?: JwtUser): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getClass: () => PinVerifiedGuard,
    getHandler: () => undefined,
  } as unknown as ExecutionContext;
}

describe('PinVerifiedGuard', () => {
  let guard: PinVerifiedGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    guard = new PinVerifiedGuard(reflector as unknown as Reflector);
  });

  it('allows non-staff users without checking pinVerified', () => {
    const allowed = guard.canActivate(
      contextWithUser({
        sub: 'u1',
        businessId: 'b1',
        userRole: UserRole.OWNER,
        pinVerified: false,
      }),
    );

    expect(allowed).toBe(true);
  });

  it('rejects employee users when pin is not verified', () => {
    expect(() =>
      guard.canActivate(
        contextWithUser({
          sub: 'u2',
          businessId: 'b1',
          userRole: UserRole.EMPLOYEE,
          pinVerified: false,
        }),
      ),
    ).toThrow(new UnauthorizedException(AUTH_MESSAGES.ERROR.PIN_NOT_VERIFIED));
  });

  it('rejects staff users when pin is not verified', () => {
    expect(() =>
      guard.canActivate(
        contextWithUser({
          sub: 'u3',
          businessId: 'b1',
          userRole: UserRole.STAFF,
          pinVerified: false,
        }),
      ),
    ).toThrow(new UnauthorizedException(AUTH_MESSAGES.ERROR.PIN_NOT_VERIFIED));
  });

  it('allows staff users when pin is verified', () => {
    const allowed = guard.canActivate(
      contextWithUser({
        sub: 'u4',
        businessId: 'b1',
        userRole: UserRole.STAFF,
        pinVerified: true,
      }),
    );

    expect(allowed).toBe(true);
  });
});
