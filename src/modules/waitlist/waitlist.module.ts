import { Module } from '@nestjs/common';
import { WaitlistController } from './controllers/waitlist.controller';
import { AdminWaitlistController } from './controllers/admin-waitlist.controller';
import { WaitlistRepository } from './repositories/waitlist.repository';
import { WaitlistService } from './services/waitlist.service';

@Module({
  controllers: [WaitlistController, AdminWaitlistController],
  providers: [WaitlistRepository, WaitlistService],
})
export class WaitlistModule {}
