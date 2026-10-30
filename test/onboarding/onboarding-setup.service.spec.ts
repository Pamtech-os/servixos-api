import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { SupportedCountry } from 'src/common/constants/countries.constants';
import { AuthService } from 'src/modules/auth/services/auth.service';
import { BusinessCategoriesRepository } from 'src/modules/business-categories/repositories/business-categories.repository';
import { OnboardingSessionRepository } from 'src/modules/onboarding/repositories/onboarding-session.repository';
import {
  ProfileSection,
  SectionStatus,
} from 'src/modules/onboarding/schemas/onboarding-session.schema';
import {
  OnboardingSetupService,
  toWebsiteContext,
} from 'src/modules/onboarding/services/onboarding-setup.service';
import { OnboardingService } from 'src/modules/onboarding/services/onboarding.service';
import { TasksRepository } from 'src/modules/tasks/repositories/tasks.repository';
import { TaskPriority, TaskStage } from 'src/modules/tasks/schemas/task.schema';
import { WebsiteConfigRepository } from 'src/modules/website/repositories/website-config.repository';
import { WebsiteGenerationService } from 'src/modules/website/services/website-generation.service';
import { asMock } from 'test/helpers/mock';

const USER_ID = new Types.ObjectId().toString();
const BUSINESS_ID = new Types.ObjectId().toString();
const CLEANING_ID = new Types.ObjectId();
const OTHER_ID = new Types.ObjectId();
const approved = { status: SectionStatus.APPROVED };

const APPROVED_PROFILE = {
  concept: {
    ...approved,
    summary: 'Eco-friendly home cleaning',
    valueProposition: 'Spotless homes, no harsh chemicals',
    targetCustomers: ['Families'],
    industry: 'Home Cleaning',
  },
  brand: { ...approved, name: 'GreenSweep', primaryColor: '#16a34a' },
  services: {
    ...approved,
    currency: 'NGN',
    items: [{ name: 'Deep clean', description: 'Whole home' }],
  },
  plan: {
    ...approved,
    goals: ['First 10 customers'],
    actions: [
      { title: 'A1', why: 'w1', timeframe: 'Week 1' },
      { title: 'A2', why: 'w2' },
      { title: 'A3', why: 'w3' },
      { title: 'A4', why: 'w4' },
    ],
  },
};
const AI_CONTENT = { hero: { headline: 'h', subheadline: 's', ctaText: 'c' } };
const LOGIN = {
  accessToken: 'a',
  refreshToken: 'r',
  user: { businessId: BUSINESS_ID },
};

describe('OnboardingSetupService', () => {
  let service: OnboardingSetupService;
  let onboardingService: { getEligibleUser: jest.Mock };
  let sessionRepository: {
    findOrCreateByUserId: jest.Mock;
    setWebsiteDraft: jest.Mock;
    markApproved: jest.Mock;
  };
  let authService: { provisionBusiness: jest.Mock };
  let websiteGeneration: { generateAiContent: jest.Mock };
  let websiteConfigRepository: { updateByBusinessId: jest.Mock };
  let categoriesRepository: { findAll: jest.Mock };
  let tasksRepository: { create: jest.Mock };

  const withProfile = (profile: object, extra: object = {}) =>
    sessionRepository.findOrCreateByUserId.mockResolvedValue({
      profile,
      messages: [],
      ...extra,
    });

  beforeEach(() => {
    onboardingService = {
      getEligibleUser: jest.fn().mockResolvedValue({
        _id: USER_ID,
        country: SupportedCountry.NG,
      }),
    };
    sessionRepository = {
      findOrCreateByUserId: jest.fn(),
      setWebsiteDraft: jest.fn().mockResolvedValue(undefined),
      markApproved: jest.fn().mockResolvedValue(undefined),
    };
    authService = { provisionBusiness: jest.fn().mockResolvedValue(LOGIN) };
    websiteGeneration = {
      generateAiContent: jest.fn().mockResolvedValue(AI_CONTENT),
    };
    websiteConfigRepository = {
      updateByBusinessId: jest.fn().mockResolvedValue(null),
    };
    categoriesRepository = {
      findAll: jest.fn().mockResolvedValue([
        { _id: CLEANING_ID, name: 'Cleaning' },
        { _id: OTHER_ID, name: 'Other' },
      ]),
    };
    tasksRepository = { create: jest.fn().mockResolvedValue({}) };
    withProfile(APPROVED_PROFILE);

    service = new OnboardingSetupService(
      asMock<OnboardingService>(onboardingService),
      asMock<OnboardingSessionRepository>(sessionRepository),
      asMock<AuthService>(authService),
      asMock<WebsiteGenerationService>(websiteGeneration),
      asMock<WebsiteConfigRepository>(websiteConfigRepository),
      asMock<BusinessCategoriesRepository>(categoriesRepository),
      asMock<TasksRepository>(tasksRepository),
    );
    jest.spyOn(Reflect.get(service, 'logger'), 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('approveSetup', () => {
    it('lists the required sections that are not yet approved', async () => {
      // Arrange
      withProfile({
        ...APPROVED_PROFILE,
        brand: { ...APPROVED_PROFILE.brand, status: SectionStatus.DRAFT },
        services: undefined,
      });

      // Act
      const result = await service.approveSetup(USER_ID, {});

      // Assert
      expect((result as BadRequestException).getResponse()).toMatchObject({
        details: {
          missingSections: [ProfileSection.BRAND, ProfileSection.SERVICES],
        },
      });
    });

    it('returns the eligibility error for users who already have a business', async () => {
      // Arrange
      const conflict = new ConflictException('exists');
      onboardingService.getEligibleUser.mockResolvedValue(conflict);

      // Act
      const result = await service.approveSetup(USER_ID, {});

      // Assert
      expect(result).toBe(conflict);
    });

    it('provisions the business from the approved profile', async () => {
      // Arrange — APPROVED_PROFILE is loaded by default

      // Act
      await service.approveSetup(USER_ID, {});

      // Assert
      expect(authService.provisionBusiness).toHaveBeenCalledWith(USER_ID, {
        businessName: 'GreenSweep',
        categoryId: String(CLEANING_ID),
        description: 'Eco-friendly home cleaning',
        colorPrimary: '#16a34a',
        colorSecondary: undefined,
        font: undefined,
        services: ['Deep clean'],
        timezone: 'Africa/Lagos',
      });
    });

    it('falls back to the Other category when the industry matches nothing', async () => {
      // Arrange
      withProfile({
        ...APPROVED_PROFILE,
        concept: { ...APPROVED_PROFILE.concept, industry: 'Aerospace' },
      });

      // Act
      await service.approveSetup(USER_ID, {});

      // Assert
      expect(authService.provisionBusiness.mock.calls[0]).toMatchObject([
        USER_ID,
        { categoryId: String(OTHER_ID) },
      ]);
    });

    it('asks for a category when nothing matches and there is no fallback', async () => {
      // Arrange
      categoriesRepository.findAll.mockResolvedValue([]);

      // Act
      const result = await service.approveSetup(USER_ID, {});

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
    });

    it('prefers an explicit category and timezone from the request', async () => {
      // Arrange
      const chosen = new Types.ObjectId().toString();

      // Act
      await service.approveSetup(USER_ID, {
        businessCategory: chosen,
        timezone: 'Europe/London',
      });

      // Assert
      expect(authService.provisionBusiness.mock.calls[0]).toMatchObject([
        USER_ID,
        { categoryId: chosen, timezone: 'Europe/London' },
      ]);
    });

    it('links the onboarding profile to the new business', async () => {
      // Arrange — APPROVED_PROFILE is loaded by default

      // Act
      await service.approveSetup(USER_ID, {});

      // Assert
      expect(sessionRepository.markApproved).toHaveBeenCalledWith(
        USER_ID,
        BUSINESS_ID,
      );
    });

    it('copies the preview copy onto the new website config', async () => {
      // Arrange
      withProfile(APPROVED_PROFILE, {
        websiteDraft: { aiContent: AI_CONTENT, generatedAt: new Date() },
      });

      // Act
      await service.approveSetup(USER_ID, {});

      // Assert
      expect(websiteConfigRepository.updateByBusinessId).toHaveBeenCalledWith(
        BUSINESS_ID,
        { aiContent: AI_CONTENT },
      );
    });

    it('creates one starter task per plan action, the first three high priority', async () => {
      // Arrange — APPROVED_PROFILE has four actions

      // Act
      await service.approveSetup(USER_ID, {});

      // Assert
      const created = (tasksRepository.create.mock.calls as [object][]).map(
        ([task]) => task,
      );
      expect(created).toMatchObject([
        { title: 'A1', stage: TaskStage.TODO, priority: TaskPriority.HIGH },
        { title: 'A2', priority: TaskPriority.HIGH },
        { title: 'A3', priority: TaskPriority.HIGH },
        { title: 'A4', priority: TaskPriority.MEDIUM },
      ]);
    });

    it('still returns the session when a follow-up step fails', async () => {
      // Arrange
      tasksRepository.create.mockRejectedValue(new Error('db down'));

      // Act
      const result = await service.approveSetup(USER_ID, {});

      // Assert
      expect(result).toBe(LOGIN);
    });

    it('skips follow-up steps when provisioning fails', async () => {
      // Arrange
      authService.provisionBusiness.mockResolvedValue(
        new BadRequestException('pin'),
      );

      // Act
      await service.approveSetup(USER_ID, {});

      // Assert
      expect(sessionRepository.markApproved).not.toHaveBeenCalled();
    });
  });

  describe('generateWebsitePreview', () => {
    it('requires a concept and brand first', async () => {
      // Arrange
      withProfile({ concept: APPROVED_PROFILE.concept });

      // Act
      const result = await service.generateWebsitePreview(USER_ID);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
    });

    it('returns ServiceUnavailable when generation fails', async () => {
      // Arrange
      websiteGeneration.generateAiContent.mockResolvedValue(null);

      // Act
      const result = await service.generateWebsitePreview(USER_ID);

      // Assert
      expect(result).toBeInstanceOf(ServiceUnavailableException);
    });

    it('saves the generated copy as the website draft', async () => {
      // Arrange
      const instructions = 'warmer tone';

      // Act
      await service.generateWebsitePreview(USER_ID, instructions);

      // Assert
      expect(sessionRepository.setWebsiteDraft.mock.calls[0]).toMatchObject([
        USER_ID,
        { aiContent: AI_CONTENT, instructions },
      ]);
    });

    it('returns a preview in the public website shape', async () => {
      // Arrange — APPROVED_PROFILE is loaded by default

      // Act
      const result = await service.generateWebsitePreview(USER_ID);

      // Assert
      expect(result).toMatchObject({
        business: { name: 'GreenSweep', services: ['Deep clean'] },
        website: { colorPrimary: '#16a34a', aiContent: AI_CONTENT },
      });
    });
  });
});

describe('toWebsiteContext', () => {
  it('passes the brand, concept, services and change requests to the generator', () => {
    // Arrange
    const profile = APPROVED_PROFILE as never;

    // Act
    const context = toWebsiteContext(profile, 'warmer');

    // Assert
    expect(context).toMatchObject({
      name: 'GreenSweep',
      categoryName: 'Home Cleaning',
      valueProposition: 'Spotless homes, no harsh chemicals',
      services: [{ name: 'Deep clean', description: 'Whole home' }],
      instructions: 'warmer',
    });
  });
});
