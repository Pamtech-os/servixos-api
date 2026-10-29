import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ConceptInput } from 'src/modules/onboarding/dto/profile-sections.dto';
import { OnboardingSessionRepository } from 'src/modules/onboarding/repositories/onboarding-session.repository';
import {
  ProfileSection,
  SectionAuthor,
  SectionStatus,
} from 'src/modules/onboarding/schemas/onboarding-session.schema';
import {
  OnboardingService,
  validateSectionInput,
} from 'src/modules/onboarding/services/onboarding.service';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { asMock } from 'test/helpers/mock';

const USER_ID = new Types.ObjectId().toString();
const VERIFIED_USER = { _id: USER_ID, isEmailVerified: true };
const CONCEPT = {
  summary: 'Mobile car detailing for busy professionals',
  valueProposition: 'We come to you',
  targetCustomers: ['Office workers'],
};

describe('OnboardingService', () => {
  let service: OnboardingService;
  let usersRepository: { findById: jest.Mock };
  let sessionRepository: {
    findOrCreateByUserId: jest.Mock;
    setSection: jest.Mock;
    setSectionStatus: jest.Mock;
  };

  beforeEach(() => {
    usersRepository = { findById: jest.fn().mockResolvedValue(VERIFIED_USER) };
    sessionRepository = {
      findOrCreateByUserId: jest
        .fn()
        .mockResolvedValue({ profile: {}, messages: [] }),
      setSection: jest.fn().mockResolvedValue(null),
      setSectionStatus: jest.fn().mockResolvedValue(null),
    };
    service = new OnboardingService(
      asMock<UsersRepository>(usersRepository),
      asMock<OnboardingSessionRepository>(sessionRepository),
    );
  });

  describe('getEligibleUser', () => {
    it('returns Unauthorized when the email is not verified', async () => {
      // Arrange
      usersRepository.findById.mockResolvedValue({ isEmailVerified: false });

      // Act
      const result = await service.getEligibleUser(USER_ID);

      // Assert
      expect(result).toBeInstanceOf(UnauthorizedException);
    });

    it('returns Conflict when the user already has a business', async () => {
      // Arrange
      usersRepository.findById.mockResolvedValue({
        ...VERIFIED_USER,
        businessId: new Types.ObjectId(),
      });

      // Act
      const result = await service.getEligibleUser(USER_ID);

      // Assert
      expect(result).toBeInstanceOf(ConflictException);
    });
  });

  describe('getSession', () => {
    it('returns an empty session shape on first visit', async () => {
      // Arrange — default mocks return a fresh session

      // Act
      const result = await service.getSession(USER_ID);

      // Assert
      expect(result).toEqual({
        startingPoint: null,
        profile: {},
        messages: [],
      });
    });
  });

  describe('updateSection', () => {
    it('stores user edits as a draft authored by the user', async () => {
      // Arrange
      const input = { ...CONCEPT };

      // Act
      await service.updateSection(USER_ID, ProfileSection.CONCEPT, input);

      // Assert
      expect(sessionRepository.setSection).toHaveBeenCalledWith(
        USER_ID,
        ProfileSection.CONCEPT,
        expect.objectContaining({
          ...CONCEPT,
          status: SectionStatus.DRAFT,
          updatedBy: SectionAuthor.USER,
        }) as unknown,
      );
    });

    it('returns BadRequest for invalid section content', async () => {
      // Arrange
      const input = { summary: '' };

      // Act
      const result = await service.updateSection(
        USER_ID,
        ProfileSection.CONCEPT,
        input,
      );

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
    });

    it('returns BadRequest for an unknown section', async () => {
      // Arrange
      const section = 'finances';

      // Act
      const result = await service.updateSection(USER_ID, section, CONCEPT);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
    });
  });

  describe('applyAiSection', () => {
    it('marks AI-written sections as drafts authored by the AI', async () => {
      // Arrange
      const input = { ...CONCEPT };

      // Act
      await service.applyAiSection(USER_ID, ProfileSection.CONCEPT, input);

      // Assert
      expect(sessionRepository.setSection.mock.calls[0]).toMatchObject([
        USER_ID,
        ProfileSection.CONCEPT,
        { status: SectionStatus.DRAFT, updatedBy: SectionAuthor.AI },
      ]);
    });

    it('returns the validation error instead of saving invalid AI output', async () => {
      // Arrange
      const input = { name: 'x'.repeat(81) };

      // Act
      const result = await service.applyAiSection(
        USER_ID,
        ProfileSection.BRAND,
        input,
      );

      // Assert
      expect(result).toMatchObject({ ok: false });
    });
  });

  describe('approveSection', () => {
    it('returns NotFound when the section has not been drafted', async () => {
      // Arrange
      sessionRepository.setSectionStatus.mockResolvedValue(null);

      // Act
      const result = await service.approveSection(
        USER_ID,
        ProfileSection.BRAND,
      );

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('returns the approved section', async () => {
      // Arrange
      const brand = { name: 'Shine', status: SectionStatus.APPROVED };
      sessionRepository.setSectionStatus.mockResolvedValue({
        profile: { brand },
      });

      // Act
      const result = await service.approveSection(
        USER_ID,
        ProfileSection.BRAND,
      );

      // Assert
      expect(result).toEqual(brand);
    });
  });
});

describe('validateSectionInput', () => {
  it('accepts valid input', async () => {
    // Arrange
    const input = { ...CONCEPT };

    // Act
    const error = await validateSectionInput(ConceptInput, input);

    // Assert
    expect(error).toBeNull();
  });

  it('rejects properties outside the section schema', async () => {
    // Arrange
    const input = { ...CONCEPT, status: 'approved' };

    // Act
    const error = await validateSectionInput(ConceptInput, input);

    // Assert
    expect(error).toContain('status');
  });

  it('rejects non-object input', async () => {
    // Arrange
    const input: unknown = ['not', 'an', 'object'];

    // Act
    const error = await validateSectionInput(ConceptInput, input);

    // Assert
    expect(error).not.toBeNull();
  });
});
