import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ONBOARDING_MESSAGES } from 'src/common/constants/messages/onboarding.messages';
import { COUNTRY_CONFIG } from 'src/common/constants/countries.constants';
import {
  AuthService,
  type ProvisionBusinessResult,
} from '../../auth/services/auth.service';
import { BusinessCategoriesRepository } from '../../business-categories/repositories/business-categories.repository';
import { TasksRepository } from '../../tasks/repositories/tasks.repository';
import { TaskPriority, TaskStage } from '../../tasks/schemas/task.schema';
import type { User } from '../../users/schemas/user.schema';
import { WebsiteConfigRepository } from '../../website/repositories/website-config.repository';
import {
  type BusinessContext,
  WebsiteGenerationService,
} from '../../website/services/website-generation.service';
import { OnboardingSessionRepository } from '../repositories/onboarding-session.repository';
import {
  BusinessProfile,
  OnboardingSession,
  ProfileSection,
  SectionStatus,
} from '../schemas/onboarding-session.schema';
import { OnboardingService } from './onboarding.service';
import type { ApproveSetupDto } from '../dto/approve-setup.dto';
import type { WebsitePreviewData } from '../types/onboarding.types';

/** Sections the user must approve before the business can be created. */
export const REQUIRED_APPROVAL_SECTIONS = [
  ProfileSection.CONCEPT,
  ProfileSection.BRAND,
  ProfileSection.SERVICES,
] as const;

/** The first few plan actions become high-priority tasks; the rest medium. */
const HIGH_PRIORITY_ACTIONS = 3;
const FALLBACK_CATEGORY_NAME = 'other';
export const SETUP_NOT_APPROVED_CODE = 'SETUP_NOT_APPROVED';

/**
 * Turns an approved discovery profile into a live business: website preview
 * while drafting, then business creation, website content and starter tasks.
 */
@Injectable()
export class OnboardingSetupService {
  private readonly logger = new Logger(OnboardingSetupService.name);

  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly sessionRepository: OnboardingSessionRepository,
    private readonly authService: AuthService,
    private readonly websiteGenerationService: WebsiteGenerationService,
    private readonly websiteConfigRepository: WebsiteConfigRepository,
    private readonly categoriesRepository: BusinessCategoriesRepository,
    private readonly tasksRepository: TasksRepository,
  ) {}

  /** Returns the live website preview built from the current profile and latest draft copy. */
  async getWebsitePreview(
    userId: string,
  ): Promise<WebsitePreviewData | HttpException> {
    const user = await this.onboardingService.getEligibleUser(userId);
    if (user instanceof HttpException) return user;

    const session = await this.sessionRepository.findOrCreateByUserId(userId);
    return toPreview(session.profile ?? {}, session);
  }

  /** Regenerates the website copy from the profile, applying optional change requests. */
  async generateWebsitePreview(
    userId: string,
    instructions?: string,
  ): Promise<WebsitePreviewData | HttpException> {
    const user = await this.onboardingService.getEligibleUser(userId);
    if (user instanceof HttpException) return user;

    const session = await this.sessionRepository.findOrCreateByUserId(userId);
    const profile = session.profile ?? {};
    const context = toWebsiteContext(profile, instructions);
    if (!context) {
      return new BadRequestException(
        ONBOARDING_MESSAGES.ERROR.PREVIEW_NEEDS_PROFILE,
      );
    }

    const aiContent =
      await this.websiteGenerationService.generateAiContent(context);
    if (!aiContent) {
      return new ServiceUnavailableException(
        ONBOARDING_MESSAGES.ERROR.PREVIEW_FAILED,
      );
    }

    const websiteDraft = { aiContent, instructions, generatedAt: new Date() };
    await this.sessionRepository.setWebsiteDraft(userId, websiteDraft);
    return toPreview(profile, { ...session, websiteDraft });
  }

  /**
   * Creates the business from the approved profile and moves the user into
   * their Online Office. Follow-up steps (website copy, starter tasks) are
   * best-effort: the business exists even if one of them fails.
   */
  async approveSetup(
    userId: string,
    dto: ApproveSetupDto,
  ): Promise<ProvisionBusinessResult | HttpException> {
    const user = await this.onboardingService.getEligibleUser(userId);
    if (user instanceof HttpException) return user;

    const session = await this.sessionRepository.findOrCreateByUserId(userId);
    const profile = session.profile ?? {};

    const missing = REQUIRED_APPROVAL_SECTIONS.filter(
      (section) => profile[section]?.status !== SectionStatus.APPROVED,
    );
    if (missing.length || !profile.brand || !profile.concept) {
      return new BadRequestException({
        code: SETUP_NOT_APPROVED_CODE,
        message: ONBOARDING_MESSAGES.ERROR.SETUP_NOT_APPROVED,
        details: { missingSections: missing },
      });
    }

    const categoryId =
      dto.businessCategory ??
      (await this.matchCategory(profile.concept.industry));
    if (!categoryId) {
      return new BadRequestException(
        ONBOARDING_MESSAGES.ERROR.CATEGORY_REQUIRED,
      );
    }

    const result = await this.authService.provisionBusiness(userId, {
      businessName: profile.brand.name,
      categoryId,
      description: profile.concept.summary,
      colorPrimary: profile.brand.primaryColor,
      colorSecondary: profile.brand.secondaryColor,
      font: profile.brand.font,
      services: profile.services?.items.map((s) => s.name) ?? [],
      timezone: dto.timezone ?? defaultTimezone(user),
    });
    if (result instanceof HttpException) return result;

    const businessId = result.user.businessId!;
    await Promise.allSettled([
      this.sessionRepository.markApproved(userId, businessId),
      this.applyWebsiteDraft(businessId, session),
      this.seedStarterTasks(businessId, userId, profile),
    ]).then((outcomes) =>
      outcomes
        .filter((o): o is PromiseRejectedResult => o.status === 'rejected')
        .forEach((o) =>
          this.logger.error(
            `approveSetup follow-up failed [businessId=${businessId}]: ${o.reason instanceof Error ? o.reason.stack : String(o.reason)}`,
          ),
        ),
    );

    return result;
  }

  /**
   * Finds the category whose name appears in the AI-suggested industry (or
   * vice versa), falling back to "Other". O(c) over the category list.
   */
  private async matchCategory(industry?: string): Promise<string | null> {
    const categories = await this.categoriesRepository.findAll();
    const needle = industry?.trim().toLowerCase();

    const match =
      (needle &&
        categories.find((c) => {
          const name = c.name.toLowerCase();
          return needle.includes(name) || name.includes(needle);
        })) ||
      categories.find((c) => c.name.toLowerCase() === FALLBACK_CATEGORY_NAME);

    return match ? String(match._id) : null;
  }

  /** Copies the approved preview copy onto the new website (unpublished until the owner publishes). */
  private async applyWebsiteDraft(
    businessId: string,
    session: OnboardingSession,
  ): Promise<void> {
    if (!session.websiteDraft) return;
    await this.websiteConfigRepository.updateByBusinessId(businessId, {
      aiContent: session.websiteDraft.aiContent,
    });
  }

  private async seedStarterTasks(
    businessId: string,
    userId: string,
    profile: BusinessProfile,
  ): Promise<void> {
    const actions = profile.plan?.actions ?? [];
    await Promise.all(
      actions.map((action, index) =>
        this.tasksRepository.create({
          businessId: new Types.ObjectId(businessId),
          createdById: new Types.ObjectId(userId),
          title: action.title,
          description: action.timeframe
            ? `${action.why}\n\nTimeframe: ${action.timeframe}`
            : action.why,
          stage: TaskStage.TODO,
          priority:
            index < HIGH_PRIORITY_ACTIONS
              ? TaskPriority.HIGH
              : TaskPriority.MEDIUM,
        }),
      ),
    );
  }
}

function defaultTimezone(user: User): string {
  return user.country ? COUNTRY_CONFIG[user.country].defaultTimezone : 'UTC';
}

/** Website generation needs at least a name (brand) and a description (concept). */
export function toWebsiteContext(
  profile: BusinessProfile,
  instructions?: string,
): BusinessContext | null {
  const { brand, concept, services } = profile;
  if (!brand || !concept) return null;

  return {
    name: brand.name,
    categoryName: concept.industry ?? 'service',
    description: concept.summary,
    tagline: brand.tagline,
    valueProposition: concept.valueProposition,
    targetCustomers: concept.targetCustomers,
    services: services?.items.map((s) => ({
      name: s.name,
      description: s.description,
    })),
    tone: brand.tone,
    instructions,
  };
}

function toPreview(
  profile: BusinessProfile,
  session: Pick<OnboardingSession, 'websiteDraft'>,
): WebsitePreviewData {
  return {
    business: {
      name: profile.brand?.name ?? '',
      categoryName: profile.concept?.industry ?? '',
      description: profile.concept?.summary,
      services: profile.services?.items.map((s) => s.name) ?? [],
    },
    website: {
      colorPrimary: profile.brand?.primaryColor ?? '#2563eb',
      colorSecondary: profile.brand?.secondaryColor ?? '#64748b',
      font: profile.brand?.font ?? 'Inter',
      aiContent: session.websiteDraft?.aiContent,
    },
    generatedAt: session.websiteDraft?.generatedAt ?? null,
  };
}
