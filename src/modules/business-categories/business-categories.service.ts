import { Injectable } from '@nestjs/common';
import { BusinessCategoriesRepository } from './business-categories.repository';
import { RedisService } from '../redis/redis.service';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { BusinessCategory } from './schemas/business-category.schema';

const CACHE_KEY = 'business_categories:all';

@Injectable()
export class BusinessCategoriesService {
  constructor(
    private readonly businessCategoriesRepository: BusinessCategoriesRepository,
    private readonly redisService: RedisService,
  ) {}

  async findAll(): Promise<BusinessCategory[]> {
    const cached = await this.redisService.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as BusinessCategory[];

    const categories = await this.businessCategoriesRepository.findAll();
    await this.redisService.set(
      CACHE_KEY,
      JSON.stringify(categories),
      CACHE_TTL.BUSINESS_CATEGORIES,
    );
    return categories;
  }
}
