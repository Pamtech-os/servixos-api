import { InternalServerErrorException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { ReviewsRepository } from 'src/modules/reviews/repositories/reviews.repository';
import { ReviewsService } from 'src/modules/reviews/services/reviews.service';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = new Types.ObjectId().toString();

describe('ReviewsService', () => {
  let service: ReviewsService;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  const reviewsRepository = {
    findAll: jest.fn(),
    getStats: jest.fn(),
  };

  const redisService = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ReviewsService(
      asMock<ReviewsRepository>(reviewsRepository),
      asMock<RedisService>(redisService),
    );

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  describe('listReviews', () => {
    it('returns cached result when Redis has a matching key', async () => {
      // Arrange
      // IDs are plain strings so the JSON round-trip in the service produces the same shape
      const cached = {
        data: [{ _id: new Types.ObjectId().toHexString(), rating: 5 }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      redisService.get
        .mockResolvedValueOnce('1')
        .mockResolvedValueOnce(JSON.stringify(cached));

      // Act
      const result = await service.listReviews(BUSINESS_ID, {});

      // Assert
      expect(result).toEqual(cached);
      expect(reviewsRepository.findAll).not.toHaveBeenCalled();
    });

    it('queries the repository and writes to cache on a cache miss', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      reviewsRepository.findAll.mockResolvedValue({
        data: [{ _id: new Types.ObjectId(), rating: 4 }],
        total: 1,
      });

      // Act
      const result = await service.listReviews(BUSINESS_ID, {
        page: 1,
        limit: 10,
      });

      // Assert
      expect(reviewsRepository.findAll).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
    });

    it('filters by rating when dto.rating is provided', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      reviewsRepository.findAll.mockResolvedValue({ data: [], total: 0 });

      // Act
      await service.listReviews(BUSINESS_ID, { rating: 5 });

      // Assert
      expect(reviewsRepository.findAll).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        { rating: 5 },
        expect.any(Object),
      );
    });

    it('returns InternalServerErrorException when repository throws', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      reviewsRepository.findAll.mockRejectedValue(new Error('db error'));

      // Act
      const result = await service.listReviews(BUSINESS_ID, {});

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('getReviewStats', () => {
    it('returns cached stats when Redis has a matching key', async () => {
      // Arrange
      const cached = {
        average: 4.2,
        count: 10,
        distribution: { '1': 0, '2': 1, '3': 1, '4': 4, '5': 4 },
      };
      redisService.get.mockResolvedValue(JSON.stringify(cached));

      // Act
      const result = await service.getReviewStats(BUSINESS_ID);

      // Assert
      expect(result).toEqual(cached);
      expect(reviewsRepository.getStats).not.toHaveBeenCalled();
    });

    it('queries the repository and caches the result on a cache miss', async () => {
      // Arrange
      const stats = {
        average: 4.5,
        count: 8,
        distribution: { '1': 0, '2': 0, '3': 1, '4': 3, '5': 4 },
      };
      redisService.get.mockResolvedValue(null);
      reviewsRepository.getStats.mockResolvedValue(stats);

      // Act
      const result = await service.getReviewStats(BUSINESS_ID);

      // Assert
      expect(reviewsRepository.getStats).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalledTimes(1);
      expect(result).toEqual(stats);
    });

    it('returns InternalServerErrorException when repository throws', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      reviewsRepository.getStats.mockRejectedValue(new Error('db error'));

      // Act
      const result = await service.getReviewStats(BUSINESS_ID);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('invalidateReviewsListCache', () => {
    it('increments the version counter and removes the stats cache', async () => {
      // Arrange — defaults already set on the mock; nothing extra needed

      // Act
      await service.invalidateReviewsListCache(BUSINESS_ID);

      // Assert
      expect(redisService.incr).toHaveBeenCalledWith(
        expect.stringContaining(`${BUSINESS_ID}:reviews:list:version`),
      );
      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringContaining(`${BUSINESS_ID}:reviews:stats`),
      );
    });

    it('swallows Redis errors silently', async () => {
      // Arrange
      redisService.incr.mockRejectedValueOnce(new Error('redis down'));

      // Act & Assert — should not throw
      await expect(
        service.invalidateReviewsListCache(BUSINESS_ID),
      ).resolves.toBeUndefined();
    });
  });
});
