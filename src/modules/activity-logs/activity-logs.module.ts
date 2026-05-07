import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../users/users.module';
import { ActivityLogsController } from './activity-logs.controller';
import { ActivityLogsRepository } from './activity-logs.repository';
import { ActivityLogsService } from './activity-logs.service';

@Module({
  imports: [UsersModule, BusinessModule, RedisModule],
  controllers: [ActivityLogsController],
  providers: [ActivityLogsRepository, ActivityLogsService],
  exports: [ActivityLogsService],
})
export class ActivityLogsModule {}
