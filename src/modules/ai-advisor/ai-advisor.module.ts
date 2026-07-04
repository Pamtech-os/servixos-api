import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { AiInsightsModule } from '../ai-insights/ai-insights.module';
import { AiAdvisorController } from './controllers/ai-advisor.controller';
import { AiAdvisorRepository } from './repositories/ai-advisor.repository';
import { AiAdvisorService } from './services/ai-advisor.service';

/**
 * AI Advisor module — answers free-form pricing/marketing/operations
 * questions for the business portal.
 *
 * Dependencies:
 *   BusinessModule   — provides BusinessRepository, used by SubscriptionGuard
 *                      (via @RequirePlan) to resolve the business's plan.
 *   AiInsightsModule — reuses AiInsightsRepository for metrics already
 *                      computed there (unpaid invoices, project value trend,
 *                      revenue, job completion, scheduling clusters) instead
 *                      of duplicating those aggregations.
 *   RedisModule      — global module, injected automatically.
 *
 * AiAdvisorRepository only covers the additional marketing-only metrics
 * (reviews, client growth, top clients by spend) not already exposed by
 * AiInsightsRepository.
 */
@Module({
  imports: [BusinessModule, AiInsightsModule],
  controllers: [AiAdvisorController],
  providers: [AiAdvisorRepository, AiAdvisorService],
})
export class AiAdvisorModule {}
