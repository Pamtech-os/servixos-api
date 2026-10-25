import { Controller, Get } from '@nestjs/common';
import { BusinessCategoriesService } from '../services/business-categories.service';
import { Public } from 'src/common/decorators/public.decorator';
import { BUSINESS_CATEGORIES_MESSAGES } from 'src/common/constants/messages/business-categories.messages';

@Public()
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
