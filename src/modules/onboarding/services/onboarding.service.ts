import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ONBOARDING_MESSAGES } from 'src/common/constants/messages/onboarding.messages';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { UsersRepository } from '../../users/repositories/users.repository';
import type { User } from '../../users/schemas/user.schema';
import { OnboardingSessionRepository } from '../repositories/onboarding-session.repository';
import {
  OnboardingSession,
  ProfileSection,
  SectionAuthor,
  SectionStatus,
  StartingPoint,
} from '../schemas/onboarding-session.schema';
import { SECTION_BY_KEY } from '../constants/discovery-agent.constants';
import type {
  OnboardingSessionData,
  SectionValue,
  SectionWriteResult,
} from '../types/onboarding.types';

type EligibilityError = UnauthorizedException | ConflictException;

@Injectable()
export class OnboardingService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionRepository: OnboardingSessionRepository,
  ) {}

  /** Loads the user if they may use AI discovery (verified, no business yet). */
  async getEligibleUser(userId: string): Promise<User | EligibilityError> {
    const user = await this.usersRepository.findById(userId);
    if (!user || user.deletedAt || !user.isEmailVerified) {
      return new UnauthorizedException(AUTH_MESSAGES.ERROR.UNAUTHORIZED);
    }
    if (user.businessId) {
      return new ConflictException(
        ONBOARDING_MESSAGES.ERROR.BUSINESS_ALREADY_CREATED,
      );
    }
    return user;
  }

  /** Returns the user's discovery session (transcript + structured profile), creating it on first visit. */
  async getSession(
    userId: string,
  ): Promise<OnboardingSessionData | EligibilityError> {
    const user = await this.getEligibleUser(userId);
    if (user instanceof Error) return user;

    return toSessionData(
      await this.sessionRepository.findOrCreateByUserId(userId),
    );
  }

  /** Replaces a profile section with user-edited content; the section returns to draft. */
  async updateSection(
    userId: string,
    section: string,
    input: unknown,
  ): Promise<SectionValue | EligibilityError | BadRequestException> {
    const user = await this.getEligibleUser(userId);
    if (user instanceof Error) return user;

    await this.sessionRepository.findOrCreateByUserId(userId);
    const result = await this.writeSection(
      userId,
      section,
      input,
      SectionAuthor.USER,
    );
    return result.ok ? result.value : new BadRequestException(result.error);
  }

  /** Marks a drafted section as approved by the user. */
  async approveSection(
    userId: string,
    section: string,
  ): Promise<
    SectionValue | EligibilityError | BadRequestException | NotFoundException
  > {
    const user = await this.getEligibleUser(userId);
    if (user instanceof Error) return user;

    if (!SECTION_BY_KEY.has(section)) {
      return new BadRequestException(
        ONBOARDING_MESSAGES.VALIDATION.SECTION_INVALID,
      );
    }

    const updated = await this.sessionRepository.setSectionStatus(
      userId,
      section,
      SectionStatus.APPROVED,
    );
    const value = updated?.profile[section as ProfileSection];
    if (!value) {
      return new NotFoundException(ONBOARDING_MESSAGES.ERROR.SECTION_NOT_FOUND);
    }
    return value;
  }

  /**
   * Validates and saves a section written by the AI. On failure the error
   * message is relayed back to the model so it can correct its tool call.
   */
  async applyAiSection(
    userId: string,
    section: ProfileSection,
    input: unknown,
  ): Promise<SectionWriteResult> {
    return this.writeSection(userId, section, input, SectionAuthor.AI);
  }

  /** Records the user's starting point (no idea / has idea / existing business). */
  async setStartingPoint(
    userId: string,
    startingPoint: StartingPoint,
  ): Promise<void> {
    await this.sessionRepository.setStartingPoint(userId, startingPoint);
  }

  private async writeSection(
    userId: string,
    section: string,
    input: unknown,
    author: SectionAuthor,
  ): Promise<SectionWriteResult> {
    const definition = SECTION_BY_KEY.get(section);
    if (!definition) {
      return {
        ok: false,
        error: ONBOARDING_MESSAGES.VALIDATION.SECTION_INVALID,
      };
    }

    const error = await validateSectionInput(definition.input, input);
    if (error) return { ok: false, error };

    const value = {
      ...(input as object),
      status: SectionStatus.DRAFT,
      updatedBy: author,
      updatedAt: new Date(),
    };
    const updated = await this.sessionRepository.setSection(
      userId,
      section,
      value,
    );
    return {
      ok: true,
      value: (updated?.profile[definition.section] ?? value) as SectionValue,
    };
  }
}

/** Runs class-validator on untrusted input; returns a flattened error message or null when valid. */
export async function validateSectionInput(
  dto: new () => object,
  input: unknown,
): Promise<string | null> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return ONBOARDING_MESSAGES.VALIDATION.TEXT_INVALID;
  }
  const instance = plainToInstance(dto, input);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.length ? flattenErrors(errors).join('; ') : null;
}

function flattenErrors(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((e) => {
    const path = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {}).map((m) => `${path}: ${m}`);
    return [...own, ...flattenErrors(e.children ?? [], path)];
  });
}

function toSessionData(session: OnboardingSession): OnboardingSessionData {
  return {
    startingPoint: session.startingPoint ?? null,
    profile: session.profile ?? {},
    messages: session.messages ?? [],
  };
}
