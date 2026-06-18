import {
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
import type { UpdateBookingFormDto } from '../dto/update-booking-form.dto';

interface BusinessContext {
  name: string;
  categoryName: string;
  description?: string;
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
    aiContent?: AiContent;
    bookingForm?: BookingForm;
  };
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
        aiContent: config.aiContent,
        bookingForm: config.bookingForm,
      },
    };
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

  private async generateAiContent(
    context: BusinessContext,
  ): Promise<AiContent | null> {
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

    return `Generate professional website content for a ${context.categoryName} business named "${context.name}".${desc}

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
