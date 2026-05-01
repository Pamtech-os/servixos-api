import { Module } from '@nestjs/common';
import { BusinessCategoriesRepository } from './business-categories.repository';
import { BusinessCategoriesService } from './business-categories.service';
import { BusinessCategoriesController } from './business-categories.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [BusinessCategoriesController],
  providers: [BusinessCategoriesRepository, BusinessCategoriesService],
  exports: [BusinessCategoriesRepository],
})
export class BusinessCategoriesModule {}
