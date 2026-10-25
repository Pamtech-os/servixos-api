import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { RedisModule } from '../redis/redis.module';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewsRepository } from './repositories/reviews.repository';
import { ReviewsService } from './services/reviews.service';

@Module({
  imports: [RedisModule, JobsModule],
  controllers: [ReviewsController],
  providers: [ReviewsRepository, ReviewsService],
  exports: [ReviewsRepository, ReviewsService],
})
export class ReviewsModule {}
