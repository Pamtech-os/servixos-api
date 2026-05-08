import { Injectable, Logger } from '@nestjs/common';
import { BusinessCategoriesRepository } from '../repositories/business-categories.repository';
import { RedisService } from '../../redis/services/redis.service';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { BusinessCategory } from '../schemas/business-category.schema';

const CACHE_KEY = 'business_categories:all';

@Injectable()
export class BusinessCategoriesService {
  private readonly logger = new Logger(BusinessCategoriesService.name);

  constructor(
    private readonly businessCategoriesRepository: BusinessCategoriesRepository,
    private readonly redisService: RedisService,
  ) {}

  async findAll(): Promise<BusinessCategory[]> {
    try {
      const cached = await this.redisService.get(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as unknown;
        if (Array.isArray(parsed)) {
          return parsed as BusinessCategory[];
        }

        this.logger.warn(
          'findAll: invalid cache payload type for business categories; refreshing from database',
        );
        await this.redisService.del(CACHE_KEY);
      }
    } catch (error) {
      this.logger.warn(
        `findAll: failed to read/parse cache; falling back to database [reason=${error instanceof Error ? error.message : String(error)}]`,
      );
      await this.redisService.del(CACHE_KEY);
    }

    const categories = await this.businessCategoriesRepository.findAll();
    try {
      await this.redisService.set(
        CACHE_KEY,
        JSON.stringify(categories),
        CACHE_TTL.BUSINESS_CATEGORIES,
      );
    } catch (error) {
      this.logger.warn(
        `findAll: failed to write cache; returning uncached data [reason=${error instanceof Error ? error.message : String(error)}]`,
      );
    }
    return categories;
  }
}
