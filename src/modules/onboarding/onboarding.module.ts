import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { WebsiteModule } from '../website/website.module';
import { BusinessCategoriesModule } from '../business-categories/business-categories.module';
import { TasksModule } from '../tasks/tasks.module';
import { OnboardingSetupService } from './services/onboarding-setup.service';
import { OnboardingSessionRepository } from './repositories/onboarding-session.repository';
import { OnboardingService } from './services/onboarding.service';
import { DiscoveryAgentService } from './services/discovery-agent.service';
import { DiscoveryController } from './controllers/discovery.controller';

@Module({
  imports: [
    UsersModule,
    AuthModule,
    WebsiteModule,
    BusinessCategoriesModule,
    TasksModule,
  ],
  controllers: [DiscoveryController],
  providers: [
    OnboardingSessionRepository,
    OnboardingService,
    OnboardingSetupService,
    DiscoveryAgentService,
  ],
  exports: [OnboardingSessionRepository, OnboardingService],
})
export class OnboardingModule {}
