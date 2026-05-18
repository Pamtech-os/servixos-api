import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CLIENT_CACHE_KEYS } from 'src/client/constants/cache-keys';
import { CLIENT_CACHE_TTLS } from 'src/client/constants/cache-ttls';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { JOBS } from 'src/common/constants/agenda.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { REVIEWS_MESSAGES } from 'src/common/constants/messages/reviews.messages';
import { AgendaService } from '../../agenda/services/agenda.service';
import { JobsRepository } from '../../jobs/repositories/jobs.repository';
import { JobStatus } from '../../jobs/schemas/job.schema';
import { ReviewsRepository } from '../../reviews/repositories/reviews.repository';
import { ReviewsService } from '../../reviews/services/reviews.service';
import { Review } from '../../reviews/schemas/review.schema';
import { RedisService } from '../../redis/services/redis.service';
import { CreateReviewDto } from '../../reviews/dto/create-review.dto';

@Injectable()
export class ClientReviewsService {
  private readonly logger = new Logger(ClientReviewsService.name);

  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly reviewsService: ReviewsService,
    private readonly jobsRepository: JobsRepository,
    private readonly agendaService: AgendaService,
    private readonly redisService: RedisService,
  ) {}

  /** Submits a review for a completed job owned by the calling client. */
  async submitReview(
    businessId: string,
    clientId: string,
    jobId: string,
    dto: CreateReviewDto,
  ): Promise<
    | Review
    | NotFoundException
    | BadRequestException
    | ConflictException
    | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const jId = new Types.ObjectId(jobId);

      const job = await this.jobsRepository.findById(jobId, bId);

      if (!job || job.clientId.toString() !== clientId) {
        return new NotFoundException(REVIEWS_MESSAGES.ERROR.JOB_NOT_FOUND);
      }

      if (job.status !== JobStatus.COMPLETED) {
        return new BadRequestException(
          REVIEWS_MESSAGES.ERROR.JOB_NOT_COMPLETED,
        );
      }

      const existing = await this.reviewsRepository.findByJobId(jId, bId);
      if (existing) {
        return new ConflictException(REVIEWS_MESSAGES.ERROR.DUPLICATE);
      }

      const review = await this.reviewsRepository.create({
        businessId: bId,
        clientId: new Types.ObjectId(clientId),
        jobId: jId,
        rating: dto.rating,
        comment: dto.comment,
      });

      void this.agendaService.now(JOBS.REVIEW_SUBMITTED, {
        businessId,
        jobId,
        rating: dto.rating,
        clientId,
      });

      await Promise.all([
        this.reviewsService.invalidateReviewsListCache(businessId),
        this.redisService
          .del(CLIENT_CACHE_KEYS.review(clientId, jobId))
          .catch(() => undefined),
      ]);

      return review;
    } catch (error) {
      this.logger.error(
        `submitReview: failed [businessId=${businessId}, clientId=${clientId}, jobId=${jobId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Returns the client's review for a specific job, or 404 if none exists. */
  async getReview(
    businessId: string,
    clientId: string,
    jobId: string,
  ): Promise<Review | NotFoundException | InternalServerErrorException> {
    try {
      const cacheKey = CLIENT_CACHE_KEYS.review(clientId, jobId);
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as Review;

      const bId = new Types.ObjectId(businessId);
      const jId = new Types.ObjectId(jobId);

      const review = await this.reviewsRepository.findByJobId(jId, bId);

      if (!review || review.clientId.toString() !== clientId) {
        return new NotFoundException(CLIENT_MESSAGES.REVIEW.ERROR.NOT_FOUND);
      }

      await this.redisService
        .set(cacheKey, JSON.stringify(review), CLIENT_CACHE_TTLS.REVIEW_SINGLE)
        .catch(() => undefined);

      return review;
    } catch (error) {
      this.logger.error(
        `getReview: failed [businessId=${businessId}, clientId=${clientId}, jobId=${jobId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }
}
