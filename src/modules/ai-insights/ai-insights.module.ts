import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { AiInsightsController } from './controllers/ai-insights.controller';
import { AiInsightsRepository } from './repositories/ai-insights.repository';
import { AiInsightsService } from './services/ai-insights.service';

/**
 * AI Insights module — generates business insight cards for the business
 * portal dashboard.
 *
 * Dependencies:
 *   BusinessModule — provides BusinessRepository, used by SubscriptionGuard
 *                    (via @RequirePlan) to resolve the business's plan.
 *   RedisModule    — global module, injected automatically.
 *
 * The AiInsightsRepository instantiates its own Typegoose models (Invoice,
 * Job, Client, Contract, Payment) directly from the shared Mongoose
 * connection, keeping the module self-contained without needing to import
 * every upstream module — same pattern as AnalyticsModule.
 */
@Module({
  imports: [BusinessModule],
  controllers: [AiInsightsController],
  providers: [AiInsightsRepository, AiInsightsService],
  exports: [AiInsightsRepository],
})
export class AiInsightsModule {}
