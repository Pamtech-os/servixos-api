import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { OnboardingSessionRepository } from './repositories/onboarding-session.repository';
import { OnboardingService } from './services/onboarding.service';
import { DiscoveryAgentService } from './services/discovery-agent.service';
import { DiscoveryController } from './controllers/discovery.controller';

@Module({
  imports: [UsersModule],
  controllers: [DiscoveryController],
  providers: [
    OnboardingSessionRepository,
    OnboardingService,
    DiscoveryAgentService,
  ],
  exports: [OnboardingSessionRepository, OnboardingService],
})
export class OnboardingModule {}
