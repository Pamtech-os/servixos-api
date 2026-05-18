import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { REVIEWS_MESSAGES } from 'src/common/constants/messages/reviews.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { ListReviewsDto } from '../dto/list-reviews.dto';
import { ReviewsService } from '../services/reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listReviews(
    @CurrentUser() user: JwtUser,
    @Query() query: ListReviewsDto,
  ) {
    const result = await this.reviewsService.listReviews(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: REVIEWS_MESSAGES.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getReviewStats(@CurrentUser() user: JwtUser) {
    const result = await this.reviewsService.getReviewStats(user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: REVIEWS_MESSAGES.SUCCESS.RETRIEVED,
      data: result,
    };
  }
}
