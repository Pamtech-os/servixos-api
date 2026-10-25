import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { AiInsightsModule } from '../ai-insights/ai-insights.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { AiSuggestionsController } from './controllers/ai-suggestions.controller';
import { AiSuggestionsRepository } from './repositories/ai-suggestions.repository';
import { AiSuggestionCopywriterService } from './services/ai-suggestion-copywriter.service';
import { AiSuggestionsService } from './services/ai-suggestions.service';

/**
 * AI Suggestions module — actionable cash-flow, pricing and customer-retention
 * suggestions for the business portal, each reviewed (and optionally edited)
 * by the user before it is executed, then tracked for its outcome.
 *
 * Dependencies:
 *   BusinessModule   — BusinessRepository (plan lookup for SubscriptionGuard
 *                      and the suggestion count cap; also stores revenue targets).
 *   AiInsightsModule — reuses AiInsightsRepository for metrics already
 *                      computed there (current-month revenue, revenue trend)
 *                      instead of duplicating those aggregations.
 *   InvoicesModule   — InvoicesService.sendInvoice(), reused for the payment
 *                      reminder action instead of duplicating PDF/email logic.
 *   EmailModule      — global, injected automatically (client follow-up emails).
 *
 * AiSuggestionsRepository owns the `ai_suggestions` collection, the
 * suggestion-specific reads, and the bounded mutations behind each Execute
 * action. AiSuggestionCopywriterService is the only Claude caller.
 */
@Module({
  imports: [BusinessModule, AiInsightsModule, InvoicesModule],
  controllers: [AiSuggestionsController],
  providers: [
    AiSuggestionsRepository,
    AiSuggestionCopywriterService,
    AiSuggestionsService,
  ],
})
export class AiSuggestionsModule {}
