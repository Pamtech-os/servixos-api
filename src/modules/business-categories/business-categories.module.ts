import { Module } from '@nestjs/common';
import { BusinessCategoriesRepository } from './repositories/business-categories.repository';
import { BusinessCategoriesService } from './services/business-categories.service';
import { BusinessCategoriesController } from './controllers/business-categories.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [BusinessCategoriesController],
  providers: [BusinessCategoriesRepository, BusinessCategoriesService],
  exports: [BusinessCategoriesRepository],
})
export class BusinessCategoriesModule {}
