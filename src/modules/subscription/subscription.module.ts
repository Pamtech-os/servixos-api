import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { StripeModule } from '../stripe/stripe.module';
import { AgendaModule } from '../agenda/agenda.module';
import { EmailModule } from '../email/email.module';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { SubscriptionService } from './services/subscription.service';
import { SubscriptionJobsService } from './jobs/subscription-jobs.service';
import { SubscriptionController } from './controllers/subscription.controller';
import { PlanSeeder } from '../../seeders/plan.seeder';

@Module({
  imports: [BusinessModule, StripeModule, AgendaModule, EmailModule],
  controllers: [SubscriptionController],
  providers: [
    SubscriptionRepository,
    SubscriptionService,
    SubscriptionJobsService,
    PlanSeeder,
  ],
  exports: [SubscriptionRepository, SubscriptionService],
})
export class SubscriptionModule {}
