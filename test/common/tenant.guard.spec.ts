import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { ALLOW_ONBOARDING_KEY } from 'src/common/decorators/allow-onboarding.decorator';
import {
  JwtUser,
  TokenScope,
} from 'src/common/decorators/current-user.decorator';
import { TenantGuard } from 'src/common/guards/tenant.guard';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { SubscriptionStatus } from 'src/modules/business/schemas/business.schema';
import { UserRole } from 'src/modules/users/schemas/user.schema';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = new Types.ObjectId().toString();

function makeContext(
  user: Partial<JwtUser>,
  headers: Record<string, string> = {},
): ExecutionContext {
  return asMock<ExecutionContext>({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () =>
      asMock<ReturnType<ExecutionContext['switchToHttp']>>({
        getRequest: <T>() => ({ user, headers }) as T,
      }),
  });
}

describe('TenantGuard — onboarding scope', () => {
  let guard: TenantGuard;
  let metadata: Record<string, boolean>;
  let businessRepository: { findById: jest.Mock };

  beforeEach(() => {
    metadata = {};
    businessRepository = {
      findById: jest.fn().mockResolvedValue({
        subscription: { status: SubscriptionStatus.ACTIVE },
        isSuspended: false,
      }),
    };
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) => metadata[key as string]);
    guard = new TenantGuard(
      reflector,
      asMock<BusinessRepository>(businessRepository),
    );
  });

  it('rejects onboarding-scoped tokens on tenant routes', async () => {
    // Arrange
    const context = makeContext({
      sub: 'u1',
      businessId: '',
      userRole: UserRole.OWNER,
      scope: TokenScope.ONBOARDING,
    });

    // Act
    const result = guard.canActivate(context);

    // Assert
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows onboarding-scoped tokens on @AllowOnboarding routes without a business header', async () => {
    // Arrange
    metadata[ALLOW_ONBOARDING_KEY] = true;
    const context = makeContext({
      sub: 'u1',
      businessId: '',
      scope: TokenScope.ONBOARDING,
    });

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('skips the business lookup on @AllowOnboarding routes', async () => {
    // Arrange
    metadata[ALLOW_ONBOARDING_KEY] = true;
    const context = makeContext({ sub: 'u1', businessId: BUSINESS_ID });

    // Act
    await guard.canActivate(context);

    // Assert
    expect(businessRepository.findById).not.toHaveBeenCalled();
  });

  it('still admits full-scope tokens whose business matches the header', async () => {
    // Arrange
    const context = makeContext(
      { sub: 'u1', businessId: BUSINESS_ID },
      { 'x-business-id': BUSINESS_ID },
    );

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });
});
