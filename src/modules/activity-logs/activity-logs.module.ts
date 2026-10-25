import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../users/users.module';
import { ActivityLogsController } from './controllers/activity-logs.controller';
import { ActivityLogsRepository } from './repositories/activity-logs.repository';
import { ActivityLogsService } from './services/activity-logs.service';

@Module({
  imports: [UsersModule, BusinessModule, RedisModule],
  controllers: [ActivityLogsController],
  providers: [ActivityLogsRepository, ActivityLogsService],
  exports: [ActivityLogsService],
})
export class ActivityLogsModule {}
