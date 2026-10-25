import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { REVIEWS_MESSAGES } from 'src/common/constants/messages/reviews.messages';

export class CreateReviewDto {
  @IsInt({ message: REVIEWS_MESSAGES.VALIDATION.RATING_INVALID })
  @Min(1, { message: REVIEWS_MESSAGES.VALIDATION.RATING_MIN })
  @Max(5, { message: REVIEWS_MESSAGES.VALIDATION.RATING_MAX })
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: REVIEWS_MESSAGES.VALIDATION.COMMENT_MAX })
  @Transform(({ value }: { value: string }) => value?.trim())
  comment?: string;
}
