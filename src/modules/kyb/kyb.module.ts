import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PremblyService } from './services/prembly.service';
import { KybJobsService } from './jobs/kyb-jobs.service';

@Module({
  imports: [UsersModule],
  providers: [PremblyService, KybJobsService],
  exports: [PremblyService],
})
export class KybModule {}
