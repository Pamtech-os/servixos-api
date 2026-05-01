import { Controller, Get, UseGuards } from '@nestjs/common';
import { BusinessCategoriesService } from './business-categories.service';
import { Public } from 'src/common/decorators/public.decorator';
import { ApiKeyGuard } from 'src/common/guards/api-key.guard';
import { BUSINESS_CATEGORIES_MESSAGES } from 'src/common/constants/messages/business-categories.messages';

@Public()
@UseGuards(ApiKeyGuard)
@Controller('business-categories')
export class BusinessCategoriesController {
  constructor(
    private readonly businessCategoriesService: BusinessCategoriesService,
  ) {}

  @Get()
  async findAll() {
    const data = await this.businessCategoriesService.findAll();
    return {
      message: BUSINESS_CATEGORIES_MESSAGES.SUCCESS.RETRIEVED,
      data,
    };
  }
}
