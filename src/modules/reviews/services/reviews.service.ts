import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { REVIEWS_MESSAGES } from 'src/common/constants/messages/reviews.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { RedisService } from '../../redis/services/redis.service';
import { ListReviewsDto } from '../dto/list-reviews.dto';
import { Review } from '../schemas/review.schema';
import { ReviewsRepository } from '../repositories/reviews.repository';

interface PaginatedReviews {
  data: Review[];
  meta: ReturnType<typeof buildMeta>;
}

export interface ReviewStats {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

const reviewsListVersionKey = (businessId: string): string =>
  `${businessId}:reviews:list:version`;

const reviewsListCacheKey = (businessId: string, paramsHash: string): string =>
  `${businessId}:reviews:list:${paramsHash}`;

const reviewsStatsCacheKey = (businessId: string): string =>
  `${businessId}:reviews:stats`;

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly redisService: RedisService,
  ) {}

  /** Returns a paginated, optionally rating-filtered list of reviews for the business. */
  async listReviews(
    businessId: string,
    dto: ListReviewsDto,
  ): Promise<PaginatedReviews | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit ?? 10);
      const versionRaw = await this.redisService.get(
        reviewsListVersionKey(businessId),
      );
      const version = parseInt(versionRaw ?? '1', 10) || 1;

      const paramsHash = createHash('sha1')
        .update(
          JSON.stringify({
            version,
            rating: dto.rating ?? '',
            page: pagination.page,
            limit: pagination.limit,
          }),
        )
        .digest('hex');

      const cacheKey = reviewsListCacheKey(businessId, paramsHash);
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as PaginatedReviews;

      const { data, total } = await this.reviewsRepository.findAll(
        new Types.ObjectId(businessId),
        { rating: dto.rating },
        pagination,
      );

      const result: PaginatedReviews = {
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.REVIEWS_LIST)
        .catch(() => undefined);

      return result;
    } catch (error) {
      this.logger.error(
        `listReviews: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Returns rating statistics — average, count, and per-star distribution. */
  async getReviewStats(
    businessId: string,
  ): Promise<ReviewStats | InternalServerErrorException> {
    try {
      const cacheKey = reviewsStatsCacheKey(businessId);
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as ReviewStats;

      const stats = await this.reviewsRepository.getStats(
        new Types.ObjectId(businessId),
      );

      await this.redisService
        .set(cacheKey, JSON.stringify(stats), CACHE_TTL.REVIEW_STATS)
        .catch(() => undefined);

      return stats;
    } catch (error) {
      this.logger.error(
        `getReviewStats: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(REVIEWS_MESSAGES.ERROR.NOT_FOUND);
    }
  }

  /** Bumps the version counter so all current list caches become stale, and clears stats cache. */
  async invalidateReviewsListCache(businessId: string): Promise<void> {
    try {
      const versionKey = reviewsListVersionKey(businessId);
      await this.redisService.incr(versionKey);
      await this.redisService.expire(
        versionKey,
        CACHE_TTL.REVIEWS_LIST_VERSION,
      );
      await this.redisService
        .del(reviewsStatsCacheKey(businessId))
        .catch(() => undefined);
    } catch (error) {
      this.logger.warn(
        `invalidateReviewsListCache: failed [businessId=${businessId}] ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
