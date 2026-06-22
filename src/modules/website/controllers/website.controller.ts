import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { SkipChannel } from 'src/common/decorators/channel.decorator';
import { WEBSITE_MESSAGES } from 'src/common/constants/messages/website.messages';
import { UpdateBookingFormDto } from '../dto/update-booking-form.dto';
import { UpdateDesignDto } from '../dto/update-design.dto';
import { UpdateContentDto } from '../dto/update-content.dto';
import { WebsiteGenerationService } from '../services/website-generation.service';

@Controller('website')
export class WebsiteController {
  constructor(
    private readonly websiteGenerationService: WebsiteGenerationService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getMyWebsite(@CurrentUser() user: JwtUser) {
    const result = await this.websiteGenerationService.getMyWebsite(
      user.businessId,
    );
    if (result instanceof HttpException) throw result;
    return { message: WEBSITE_MESSAGES.SUCCESS.RETRIEVED, data: result };
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generate(@CurrentUser() user: JwtUser) {
    const result = await this.websiteGenerationService.generateForBusiness(
      user.businessId,
    );
    if (result instanceof HttpException) throw result;
    return { message: WEBSITE_MESSAGES.SUCCESS.PUBLISHED, data: result };
  }

  @Public()
  @SkipSignature()
  @SkipChannel()
  @Get('public/:subdomain')
  @HttpCode(HttpStatus.OK)
  async getPublic(@Param('subdomain') subdomain: string) {
    const result =
      await this.websiteGenerationService.getPublicWebsite(subdomain);
    if (result instanceof HttpException) throw result;
    return { message: WEBSITE_MESSAGES.SUCCESS.RETRIEVED, data: result };
  }

  /** Saves color and font design tokens for the website. */
  @Patch('design')
  @HttpCode(HttpStatus.OK)
  async updateDesign(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateDesignDto,
  ) {
    const result = await this.websiteGenerationService.updateDesign(
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;
    return { message: WEBSITE_MESSAGES.SUCCESS.DESIGN_SAVED, data: null };
  }

  /** Saves edits to website content sections (hero, about, services, etc). */
  @Patch('content')
  @HttpCode(HttpStatus.OK)
  async updateContent(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateContentDto,
  ) {
    const result = await this.websiteGenerationService.updateContent(
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;
    return { message: WEBSITE_MESSAGES.SUCCESS.CONTENT_SAVED, data: null };
  }

  @Patch('booking-form')
  @HttpCode(HttpStatus.OK)
  async updateBookingForm(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateBookingFormDto,
  ) {
    const result = await this.websiteGenerationService.updateBookingForm(
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;
    return { message: WEBSITE_MESSAGES.SUCCESS.BOOKING_FORM_SAVED, data: null };
  }
}
