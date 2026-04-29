import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import type { AiContent } from './schemas/website-config.schema';
import { WebsiteConfigRepository } from './website-config.repository';
import { BusinessRepository } from '../business/business.repository';

interface BusinessContext {
  name: string;
  categoryName: string;
  description?: string;
}

export interface GeneratedWebsiteData {
  subdomain: string;
  url: string;
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
