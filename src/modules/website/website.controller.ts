import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { WebsiteGenerationService } from './website-generation.service';

@Controller('website')
export class WebsiteController {
  constructor(
    private readonly websiteGenerationService: WebsiteGenerationService,
  ) {}

  /** Triggers AI website generation and publishes the site. Requires a valid access token. */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generate(@CurrentUser() user: JwtUser) {
    return this.websiteGenerationService.generateForBusiness(user.businessId);
  }
}
