import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { BusinessModule } from '../business/business.module';
import { SupportTicketsRepository } from './repositories/support-tickets.repository';
import { SupportTicketsService } from './services/support-tickets.service';
import { SupportTicketsController } from './controllers/support-tickets.controller';

@Module({
  imports: [UsersModule, BusinessModule],
  controllers: [SupportTicketsController],
  providers: [SupportTicketsRepository, SupportTicketsService],
  exports: [SupportTicketsRepository],
})
export class SupportModule {}
