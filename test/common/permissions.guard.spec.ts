import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from 'src/common/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { UserRole } from 'src/modules/users/schemas/user.schema';

function contextWithUser(user?: {
  userRole: UserRole;
  permissions?: string[];
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getClass: () => PermissionsGuard,
    getHandler: () => undefined,
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('allows owners even when explicit permissions are missing', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === PERMISSIONS_KEY ? ['roles.view'] : undefined,
    );

    const result = guard.canActivate(
      contextWithUser({
        userRole: UserRole.OWNER,
        permissions: [],
      }),
    );

    expect(result).toBe(true);
  });

  it('denies non-owner users missing required permissions', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === PERMISSIONS_KEY ? ['roles.view'] : undefined,
    );

    expect(() =>
      guard.canActivate(
        contextWithUser({
          userRole: UserRole.EMPLOYEE,
          permissions: ['clients.view'],
        }),
      ),
    ).toThrow();
  });
});
