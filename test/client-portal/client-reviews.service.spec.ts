import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { JobsRepository } from 'src/modules/jobs/repositories/jobs.repository';
import { JobStatus } from 'src/modules/jobs/schemas/job.schema';
import { ClientReviewsService } from 'src/modules/client-portal/services/client-reviews.service';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { ReviewsRepository } from 'src/modules/reviews/repositories/reviews.repository';
import { ReviewsService } from 'src/modules/reviews/services/reviews.service';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = new Types.ObjectId().toString();
const CLIENT_ID = new Types.ObjectId().toString();
const JOB_ID = new Types.ObjectId().toString();

const makeCompletedJob = () => ({
  _id: new Types.ObjectId(JOB_ID),
  clientId: new Types.ObjectId(CLIENT_ID),
  status: JobStatus.COMPLETED,
});

describe('ClientReviewsService', () => {
  let service: ClientReviewsService;
  let loggerErrorSpy: jest.SpyInstance;

  const reviewsRepository = {
    findByJobId: jest.fn(),
    create: jest.fn(),
  };

  const reviewsService = {
    invalidateReviewsListCache: jest.fn(),
  };

  const jobsRepository = {
    findById: jest.fn(),
  };

  const agendaService = {
    now: jest.fn(),
  };

  const redisService = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(1),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ClientReviewsService(
      asMock<ReviewsRepository>(reviewsRepository),
      asMock<ReviewsService>(reviewsService),
      asMock<JobsRepository>(jobsRepository),
      asMock<AgendaService>(agendaService),
      asMock<RedisService>(redisService),
    );

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  describe('submitReview', () => {
    it('returns NotFoundException when the job does not exist', async () => {
      // Arrange
      jobsRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.submitReview(
        BUSINESS_ID,
        CLIENT_ID,
        JOB_ID,
        {
          rating: 5,
        },
      );

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('returns NotFoundException when the job belongs to a different client', async () => {
      // Arrange
      jobsRepository.findById.mockResolvedValue({
        ...makeCompletedJob(),
        clientId: new Types.ObjectId(), // different client
      });

      // Act
      const result = await service.submitReview(
        BUSINESS_ID,
        CLIENT_ID,
        JOB_ID,
        {
          rating: 4,
        },
      );

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('returns BadRequestException when the job is not yet completed', async () => {
      // Arrange
      jobsRepository.findById.mockResolvedValue({
        ...makeCompletedJob(),
        status: JobStatus.IN_PROGRESS,
      });

      // Act
      const result = await service.submitReview(
        BUSINESS_ID,
        CLIENT_ID,
        JOB_ID,
        {
          rating: 5,
        },
      );

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
    });

    it('returns ConflictException when a review already exists for the job', async () => {
      // Arrange
      jobsRepository.findById.mockResolvedValue(makeCompletedJob());
      reviewsRepository.findByJobId.mockResolvedValue({
        _id: new Types.ObjectId(),
        rating: 5,
      });

      // Act
      const result = await service.submitReview(
        BUSINESS_ID,
        CLIENT_ID,
        JOB_ID,
        {
          rating: 3,
        },
      );

      // Assert
      expect(result).toBeInstanceOf(ConflictException);
    });

    it('creates the review, fires the agenda job, and invalidates the cache on success', async () => {
      // Arrange
      const newReview = {
        _id: new Types.ObjectId(),
        businessId: new Types.ObjectId(BUSINESS_ID),
        clientId: new Types.ObjectId(CLIENT_ID),
        jobId: new Types.ObjectId(JOB_ID),
        rating: 5,
        comment: 'Great service!',
      };
      jobsRepository.findById.mockResolvedValue(makeCompletedJob());
      reviewsRepository.findByJobId.mockResolvedValue(null);
      reviewsRepository.create.mockResolvedValue(newReview);
      reviewsService.invalidateReviewsListCache.mockResolvedValue(undefined);
      redisService.del.mockResolvedValue(1);

      // Act
      const result = await service.submitReview(
        BUSINESS_ID,
        CLIENT_ID,
        JOB_ID,
        {
          rating: 5,
          comment: 'Great service!',
        },
      );

      // Assert
      expect(reviewsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ rating: 5, comment: 'Great service!' }),
      );
      expect(agendaService.now).toHaveBeenCalledWith(
        'review:submitted',
        expect.objectContaining({
          businessId: BUSINESS_ID,
          jobId: JOB_ID,
          rating: 5,
        }),
      );
      expect(reviewsService.invalidateReviewsListCache).toHaveBeenCalledWith(
        BUSINESS_ID,
      );
      expect(result).toEqual(newReview);
    });
  });

  describe('getReview', () => {
    it('returns the cached review when Redis has a matching key', async () => {
      // Arrange
      // Plain-string IDs match the JSON round-trip that the service applies to cached data
      const cachedReview = {
        _id: new Types.ObjectId().toHexString(),
        clientId: CLIENT_ID,
        rating: 4,
      };
      redisService.get.mockResolvedValue(JSON.stringify(cachedReview));

      // Act
      const result = await service.getReview(BUSINESS_ID, CLIENT_ID, JOB_ID);

      // Assert
      expect(result).toEqual(cachedReview);
      expect(reviewsRepository.findByJobId).not.toHaveBeenCalled();
    });

    it('returns NotFoundException when no review exists for the job', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      reviewsRepository.findByJobId.mockResolvedValue(null);

      // Act
      const result = await service.getReview(BUSINESS_ID, CLIENT_ID, JOB_ID);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('returns NotFoundException when the review belongs to a different client', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      reviewsRepository.findByJobId.mockResolvedValue({
        _id: new Types.ObjectId(),
        clientId: new Types.ObjectId(), // different client
        rating: 3,
      });

      // Act
      const result = await service.getReview(BUSINESS_ID, CLIENT_ID, JOB_ID);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('returns the review and caches it on a cache miss', async () => {
      // Arrange
      const review = {
        _id: new Types.ObjectId(),
        clientId: new Types.ObjectId(CLIENT_ID),
        rating: 5,
      };
      redisService.get.mockResolvedValue(null);
      reviewsRepository.findByJobId.mockResolvedValue(review);

      // Act
      const result = await service.getReview(BUSINESS_ID, CLIENT_ID, JOB_ID);

      // Assert
      expect(result).toEqual(review);
      expect(redisService.set).toHaveBeenCalledTimes(1);
    });
  });
});
