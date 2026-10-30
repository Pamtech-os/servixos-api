import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { WEBSITE_MESSAGES } from 'src/common/constants/messages/website.messages';
import type { AiContent, BookingForm } from '../schemas/website-config.schema';
import { WebsiteConfigRepository } from '../repositories/website-config.repository';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { StorageService } from '../../storage/storage.service';
import type { UpdateBookingFormDto } from '../dto/update-booking-form.dto';
import type { UpdateDesignDto } from '../dto/update-design.dto';
import type { UpdateContentDto } from '../dto/update-content.dto';

const ALLOWED_LOGO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

export interface BusinessContext {
  name: string;
  categoryName: string;
  description?: string;
  tagline?: string;
  valueProposition?: string;
  targetCustomers?: string[];
  services?: { name: string; description?: string }[];
  tone?: string;
  /** Free-form change requests from the user, e.g. "make it warmer". */
  instructions?: string;
}

export interface GeneratedWebsiteData {
  subdomain: string;
  url: string;
}

export interface PublicWebsiteData {
  business: {
    name: string;
    categoryName: string;
    description?: string;
    phone?: string;
    email?: string;
    address?: string;
    services: string[];
  };
  website: {
    colorPrimary: string;
    colorSecondary: string;
    font: string;
    logoUrl?: string;
    aiContent?: AiContent;
    bookingForm?: BookingForm;
  };
}

export interface MyWebsiteData {
  isPublished: boolean;
  subdomain: string;
  colorPrimary: string;
  colorSecondary: string;
  font: string;
  logoUrl?: string;
  aiContent?: AiContent;
  bookingForm?: BookingForm;
}

@Injectable()
export class WebsiteGenerationService {
  private readonly logger = new Logger(WebsiteGenerationService.name);
  private readonly anthropic: Anthropic;
  private readonly model: string;
  private readonly baseDomain: string;

  constructor(
    config: ConfigService,
    private readonly websiteConfigRepository: WebsiteConfigRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly storageService: StorageService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: config.get<string>('ANTHROPIC_API_KEY'),
    });
    this.model = config.get<string>('AI_WEBSITE_MODEL') || 'claude-opus-4-7';
    this.baseDomain = config.get<string>('BASE_DOMAIN') || 'servixos.com';
  }

  async generateForBusiness(
    businessId: string,
  ): Promise<
    GeneratedWebsiteData | NotFoundException | InternalServerErrorException
  > {
    try {
      const business = await this.businessRepository.findById(businessId);
      if (!business) {
        this.logger.warn(
          `generateForBusiness: business not found [businessId=${businessId}]`,
        );
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const aiContent = await this.generateAiContent({
        name: business.name,
        categoryName: business.categoryName,
        description: business.description,
      });

      await this.websiteConfigRepository.updateByBusinessId(businessId, {
        ...(aiContent && { aiContent }),
        isPublished: true,
      });

      const subdomain = business.subdomain ?? businessId;
      const url = `https://${subdomain}.${this.baseDomain}`;

      return { subdomain, url };
    } catch (err) {
      this.logger.error(
        `generateForBusiness: unexpected error [businessId=${businessId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Returns the full website configuration for the authenticated business owner,
   * including unpublished/draft state. Requires a config to already exist
   * (created via generateForBusiness).
   */
  async getMyWebsite(
    businessId: string,
  ): Promise<MyWebsiteData | NotFoundException> {
    const [business, config] = await Promise.all([
      this.businessRepository.findById(businessId),
      this.websiteConfigRepository.findByBusinessId(businessId),
    ]);

    if (!business || !config)
      return new NotFoundException(WEBSITE_MESSAGES.ERROR.NOT_FOUND);

    return {
      isPublished: config.isPublished,
      subdomain: business.subdomain ?? businessId,
      colorPrimary: config.colorPrimary,
      colorSecondary: config.colorSecondary,
      font: config.font,
      logoUrl: config.logoUrl,
      aiContent: config.aiContent,
      bookingForm: config.bookingForm,
    };
  }

  /**
   * Returns the published website content and business profile for a given
   * subdomain. Used by the public-facing frontend; no authentication required.
   */
  async getPublicWebsite(
    subdomain: string,
  ): Promise<PublicWebsiteData | NotFoundException> {
    const business = await this.businessRepository.findBySubdomain(subdomain);
    if (!business)
      return new NotFoundException(WEBSITE_MESSAGES.ERROR.NOT_FOUND);

    const config = await this.websiteConfigRepository.findByBusinessId(
      business._id.toString(),
    );
    if (!config?.isPublished)
      return new NotFoundException(WEBSITE_MESSAGES.ERROR.NOT_FOUND);

    return {
      business: {
        name: business.name,
        categoryName: business.categoryName,
        description: business.description,
        phone: business.phone,
        email: business.email,
        address: business.address,
        services: business.services,
      },
      website: {
        colorPrimary: config.colorPrimary,
        colorSecondary: config.colorSecondary,
        font: config.font,
        logoUrl: config.logoUrl,
        aiContent: config.aiContent,
        bookingForm: config.bookingForm,
      },
    };
  }

  /**
   * Saves design tokens (colors, font) to both the website config and the
   * business record so all renderers stay in sync. Returns the saved tokens
   * so the caller can update its state without an extra round-trip.
   */
  async updateDesign(
    businessId: string,
    dto: UpdateDesignDto,
  ): Promise<
    | { colorPrimary: string; colorSecondary: string; font: string }
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const config =
        await this.websiteConfigRepository.findByBusinessId(businessId);
      if (!config)
        return new NotFoundException(WEBSITE_MESSAGES.ERROR.NOT_FOUND);

      const configUpdate: Record<string, unknown> = {};
      const businessUpdate: Record<string, unknown> = {};

      if (dto.colorPrimary !== undefined) {
        configUpdate.colorPrimary = dto.colorPrimary;
        businessUpdate['colors.primary'] = dto.colorPrimary;
      }
      if (dto.colorSecondary !== undefined) {
        configUpdate.colorSecondary = dto.colorSecondary;
        businessUpdate['colors.secondary'] = dto.colorSecondary;
      }
      if (dto.font !== undefined) {
        configUpdate.font = dto.font;
        businessUpdate.font = dto.font;
      }

      const [updated] = await Promise.all([
        this.websiteConfigRepository.updateByBusinessId(
          businessId,
          configUpdate,
        ),
        Object.keys(businessUpdate).length > 0
          ? this.businessRepository.updateById(businessId, businessUpdate)
          : Promise.resolve(),
      ]);

      return {
        colorPrimary: updated?.colorPrimary ?? config.colorPrimary,
        colorSecondary: updated?.colorSecondary ?? config.colorSecondary,
        font: updated?.font ?? config.font,
      };
    } catch (err) {
      this.logger.error(
        `updateDesign: unexpected error [businessId=${businessId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Saves edits to individual aiContent sections. Only provided sections are
   * updated — omitted sections remain unchanged in the database.
   */
  async updateContent(
    businessId: string,
    dto: UpdateContentDto,
  ): Promise<void | NotFoundException | InternalServerErrorException> {
    try {
      const config =
        await this.websiteConfigRepository.findByBusinessId(businessId);
      if (!config)
        return new NotFoundException(WEBSITE_MESSAGES.ERROR.NOT_FOUND);

      // Build a flat $set map so only touched sections are overwritten
      const update: Record<string, unknown> = {};
      if (dto.hero !== undefined) update['aiContent.hero'] = dto.hero;
      if (dto.about !== undefined) update['aiContent.about'] = dto.about;
      if (dto.services !== undefined)
        update['aiContent.services'] = dto.services;
      if (dto.testimonialPlaceholder !== undefined)
        update['aiContent.testimonialPlaceholder'] = dto.testimonialPlaceholder;
      if (dto.contact !== undefined) update['aiContent.contact'] = dto.contact;

      await this.websiteConfigRepository.updateByBusinessId(businessId, update);
    } catch (err) {
      this.logger.error(
        `updateContent: unexpected error [businessId=${businessId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Saves the business-configured booking form layout (title, description,
   * field labels, placeholders, and required flags) to the website config.
   */
  async updateBookingForm(
    businessId: string,
    dto: UpdateBookingFormDto,
  ): Promise<void | NotFoundException> {
    const config =
      await this.websiteConfigRepository.findByBusinessId(businessId);
    if (!config) return new NotFoundException(WEBSITE_MESSAGES.ERROR.NOT_FOUND);

    await this.websiteConfigRepository.updateByBusinessId(businessId, {
      bookingForm: dto,
    });
  }

  /**
   * Replaces the website logo with a newly uploaded image. The previous logo
   * is deleted from storage after the new one is saved.
   */
  async updateLogo(
    businessId: string,
    file?: Express.Multer.File,
  ): Promise<
    | { logoUrl: string }
    | BadRequestException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      if (!file) {
        return new BadRequestException(WEBSITE_MESSAGES.ERROR.LOGO_MISSING);
      }

      if (!ALLOWED_LOGO_MIME_TYPES.has(file.mimetype)) {
        return new BadRequestException(
          WEBSITE_MESSAGES.ERROR.INVALID_IMAGE_TYPE,
        );
      }

      const config =
        await this.websiteConfigRepository.findByBusinessId(businessId);
      if (!config)
        return new NotFoundException(WEBSITE_MESSAGES.ERROR.NOT_FOUND);

      const { url, publicId } = await this.storageService.uploadStream(
        file,
        `servixos/logos/${businessId}`,
      );

      const previousPublicId = config.logoPublicId;

      await this.websiteConfigRepository.updateByBusinessId(businessId, {
        logoUrl: url,
        logoPublicId: publicId,
      });

      if (previousPublicId) {
        void this.storageService
          .delete(previousPublicId)
          .catch(() => undefined);
      }

      return { logoUrl: url };
    } catch (err) {
      this.logger.error(
        `updateLogo: unexpected error [businessId=${businessId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Generates website copy from a business context; returns null when generation fails. */
  async generateAiContent(context: BusinessContext): Promise<AiContent | null> {
    try {
      const message = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: this.buildPrompt(context) }],
      });

      const block = message.content[0];
      if (block.type !== 'text') return null;

      const jsonMatch = block.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      return JSON.parse(jsonMatch[0]) as AiContent;
    } catch (err) {
      this.logger.error(
        `generateAiContent: AI generation failed: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return null;
    }
  }

  private buildPrompt(context: BusinessContext): string {
    const desc = context.description
      ? ` Business description: ${context.description}.`
      : '';
    const details = [
      context.tagline && `Tagline: ${context.tagline}`,
      context.valueProposition &&
        `Value proposition: ${context.valueProposition}`,
      context.targetCustomers?.length &&
        `Target customers: ${context.targetCustomers.join(', ')}`,
      context.services?.length &&
        `Services (use these, in this order): ${context.services
          .map((s) => (s.description ? `${s.name} — ${s.description}` : s.name))
          .join('; ')}`,
      context.tone && `Tone of voice: ${context.tone}`,
      context.instructions &&
        `Requested changes from the owner: ${context.instructions}`,
    ].filter(Boolean);
    const extra = details.length ? `\n\n${details.join('\n')}` : '';

    return `Generate professional and modern website content for a ${context.categoryName} business named "${context.name}".${desc}${extra}

Return ONLY a valid JSON object (no markdown, no explanation) with this structure:
{
  "hero": { "headline": "", "subheadline": "", "ctaText": "" },
  "about": { "title": "", "body": "" },
  "services": [{ "name": "", "description": "" }],
  "testimonialPlaceholder": { "quote": "", "author": "" },
  "contact": { "callToAction": "" }
}

Make the copy compelling, professional, and specific to the business type.`;
  }
}
