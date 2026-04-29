import {
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { WEBSITE_MESSAGES } from 'src/common/constants/messages/website.messages';
import { WebsiteGenerationService } from './website-generation.service';
import { ApiKeyGuard } from 'src/common/guards/api-key.guard';

@UseGuards(ApiKeyGuard)
@Controller('website')
export class WebsiteController {
  constructor(
    private readonly websiteGenerationService: WebsiteGenerationService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generate(@CurrentUser() user: JwtUser) {
    const result = await this.websiteGenerationService.generateForBusiness(
      user.businessId,
    );
    if (result instanceof HttpException) throw result;
    return { message: WEBSITE_MESSAGES.SUCCESS.PUBLISHED, data: result };
  }
}
