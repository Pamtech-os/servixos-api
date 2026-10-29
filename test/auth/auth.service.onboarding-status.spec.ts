import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { AuthRepository } from 'src/modules/auth/repositories/auth.repository';
import { AuthService } from 'src/modules/auth/services/auth.service';
import { OnboardingNextStep } from 'src/modules/auth/types/auth.types';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessCategoriesRepository } from 'src/modules/business-categories/repositories/business-categories.repository';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { RolesRepository } from 'src/modules/roles/repositories/roles.repository';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import {
  OnboardingStage,
  User,
  UserRole,
} from 'src/modules/users/schemas/user.schema';
import { WebsiteConfigRepository } from 'src/modules/website/repositories/website-config.repository';
import { asMock } from 'test/helpers/mock';

const USER_ID = new Types.ObjectId();

function makeUser(overrides: Partial<User> = {}): Partial<User> {
  return {
    _id: USER_ID,
    firstName: 'Ada',
    email: 'ada@test.local',
    userRole: UserRole.OWNER,
    isEmailVerified: true,
    ...overrides,
  };
}

describe('AuthService.getOnboardingStatus', () => {
  let service: AuthService;
  let usersRepository: { findById: jest.Mock };

  beforeEach(() => {
    usersRepository = { findById: jest.fn() };
    service = new AuthService(
      { startSession: jest.fn() } as never,
      asMock<JwtService>({ sign: jest.fn() }),
      asMock<AuthRepository>({}),
      asMock<UsersRepository>(usersRepository),
      asMock<BusinessRepository>({}),
      asMock<RolesRepository>({}),
      asMock<WebsiteConfigRepository>({}),
      asMock<BusinessCategoriesRepository>({}),
      asMock<AgendaService>({}),
      asMock<RedisService>({}),
    );
  });

  it('uses the stored onboardingStage to choose the next step', async () => {
    // Arrange
    usersRepository.findById.mockResolvedValue(
      makeUser({ onboardingStage: OnboardingStage.PIN_SET, pinHash: 'h' }),
    );

    // Act
    const result = await service.getOnboardingStatus(USER_ID.toString());

    // Assert
    expect(result).toMatchObject({
      stage: OnboardingStage.PIN_SET,
      nextStep: OnboardingNextStep.BUSINESS_DISCOVERY,
    });
  });

  it.each<[string, Partial<User>, OnboardingStage]>([
    [
      'a business',
      { businessId: new Types.ObjectId(), pinHash: 'h' },
      OnboardingStage.COMPLETE,
    ],
    ['a PIN but no business', { pinHash: 'h' }, OnboardingStage.PIN_SET],
    ['only a verified email', {}, OnboardingStage.EMAIL_VERIFIED],
    [
      'an unverified email',
      { isEmailVerified: false },
      OnboardingStage.REGISTERED,
    ],
  ])(
    'derives the stage for legacy users with %s',
    async (_case, overrides, expected) => {
      // Arrange
      usersRepository.findById.mockResolvedValue(makeUser(overrides));

      // Act
      const result = await service.getOnboardingStatus(USER_ID.toString());

      // Assert
      expect(result).toMatchObject({ stage: expected });
    },
  );

  it('returns null businessRegistration when none was supplied', async () => {
    // Arrange
    usersRepository.findById.mockResolvedValue(makeUser());

    // Act
    const result = await service.getOnboardingStatus(USER_ID.toString());

    // Assert
    expect(result).toMatchObject({ businessRegistration: null });
  });

  it('returns Unauthorized for a deleted user', async () => {
    // Arrange
    usersRepository.findById.mockResolvedValue(
      makeUser({ deletedAt: new Date() }),
    );

    // Act
    const result = await service.getOnboardingStatus(USER_ID.toString());

    // Assert
    expect(result).toBeInstanceOf(UnauthorizedException);
  });
});
