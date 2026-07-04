import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { AiInsightsModule } from '../ai-insights/ai-insights.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { AiSuggestionsController } from './controllers/ai-suggestions.controller';
import { AiSuggestionsRepository } from './repositories/ai-suggestions.repository';
import { AiSuggestionsService } from './services/ai-suggestions.service';

/**
 * AI Suggestions module — actionable, one-click "grow your business"
 * suggestions for the business portal.
 *
 * Dependencies:
 *   BusinessModule   — BusinessRepository (plan lookup for SubscriptionGuard
 *                      and the suggestion count cap; also stores revenue targets).
 *   AiInsightsModule — reuses AiInsightsRepository for metrics already
 *                      computed there (unpaid invoices, revenue, revenue trend)
 *                      instead of duplicating those aggregations.
 *   InvoicesModule   — InvoicesService.sendInvoice(), reused for the payment
 *                      reminders action instead of duplicating PDF/email logic.
 *   EmailModule      — global, injected automatically (client follow-up emails).
 *   RedisModule      — global, injected automatically (resolved-suggestion tracking).
 *
 * AiSuggestionsRepository owns the suggestion-specific reads AND the bounded,
 * precondition-free mutations behind each "Apply" action.
 */
@Module({
  imports: [BusinessModule, AiInsightsModule, InvoicesModule],
  controllers: [AiSuggestionsController],
  providers: [AiSuggestionsRepository, AiSuggestionsService],
})
export class AiSuggestionsModule {}
