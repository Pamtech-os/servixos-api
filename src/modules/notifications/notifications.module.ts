import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { UsersModule } from '../users/users.module';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [BusinessModule, UsersModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
