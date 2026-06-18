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
import { WEBSITE_MESSAGES } from 'src/common/constants/messages/website.messages';
import { UpdateBookingFormDto } from '../dto/update-booking-form.dto';
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
  @Get('public/:subdomain')
  @HttpCode(HttpStatus.OK)
  async getPublic(@Param('subdomain') subdomain: string) {
    const result =
      await this.websiteGenerationService.getPublicWebsite(subdomain);
    if (result instanceof HttpException) throw result;
    return { message: WEBSITE_MESSAGES.SUCCESS.RETRIEVED, data: result };
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
