import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { REVIEWS_MESSAGES } from 'src/common/constants/messages/reviews.messages';

export class ListReviewsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: REVIEWS_MESSAGES.VALIDATION.RATING_INVALID })
  @Min(1, { message: REVIEWS_MESSAGES.VALIDATION.RATING_MIN })
  @Max(5, { message: REVIEWS_MESSAGES.VALIDATION.RATING_MAX })
  rating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.PAGE_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.PAGE_MIN })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: COMMON_MESSAGES.VALIDATION.LIMIT_INTEGER })
  @Min(1, { message: COMMON_MESSAGES.VALIDATION.LIMIT_MIN })
  @Max(50, { message: REVIEWS_MESSAGES.VALIDATION.LIMIT_MAX })
  limit?: number;
}
