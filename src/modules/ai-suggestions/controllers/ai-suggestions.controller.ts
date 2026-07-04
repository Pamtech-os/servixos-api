import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  HttpException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { RequirePlan } from 'src/common/decorators/require-plan.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';
import { SuggestionIdParamDto } from '../dto/suggestion-id-param.dto';
import { AiSuggestionsService } from '../services/ai-suggestions.service';

/**
 * Serves the AI Suggestions panel for the business portal.
 *
 * Route prefix: /api/ai/suggestions
 * Gated behind the `ai.suggestions` feature (available on every plan — see
 * FEATURE_PLAN_MAP). The number of suggestions shown is capped by the
 * business's plan (`PLAN_LIMITS[plan].maxAiSuggestions`).
 */
@Controller('ai/suggestions')
@UseGuards(SubscriptionGuard)
export class AiSuggestionsController {
  constructor(private readonly aiSuggestionsService: AiSuggestionsService) {}

  /** GET /ai/suggestions — returns the current suggestion list and count. */
  @Get()
  @RequirePlan('ai.suggestions')
  @HttpCode(HttpStatus.OK)
  async getSuggestions(@CurrentUser() user: JwtUser) {
    const result = await this.aiSuggestionsService.listSuggestions(
      user.businessId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: AI_MESSAGES.SUCCESS.SUGGESTIONS_GENERATED,
      data: result,
    };
  }

  /**
   * POST /ai/suggestions/:id/apply
   *
   * Applies the suggestion's one-click action (e.g. sends follow-up emails,
   * marks stale jobs complete, sets a revenue target, queues invoice
   * reminders, or bumps upcoming job pricing) and removes it from the list.
   */
  @Post(':id/apply')
  @RequirePlan('ai.suggestions')
  @HttpCode(HttpStatus.OK)
  async apply(
    @CurrentUser() user: JwtUser,
    @Param() params: SuggestionIdParamDto,
  ) {
    const result = await this.aiSuggestionsService.applySuggestion(
      user.businessId,
      params.id,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: AI_MESSAGES.SUCCESS.SUGGESTION_APPLIED,
      data: result,
    };
  }

  /** POST /ai/suggestions/:id/dismiss — hides a suggestion without applying it. */
  @Post(':id/dismiss')
  @RequirePlan('ai.suggestions')
  @HttpCode(HttpStatus.OK)
  async dismiss(
    @CurrentUser() user: JwtUser,
    @Param() params: SuggestionIdParamDto,
  ) {
    const result = await this.aiSuggestionsService.dismissSuggestion(
      user.businessId,
      params.id,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: AI_MESSAGES.SUCCESS.SUGGESTION_DISMISSED,
      data: result,
    };
  }
}
