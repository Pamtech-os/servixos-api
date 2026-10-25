import {
  Body,
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
import { ExecuteSuggestionDto } from '../dto/execute-suggestion.dto';
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

  /** GET /ai/suggestions — returns the current suggestion cards and count. */
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

  /** GET /ai/suggestions/tracked — executed suggestions with their observed outcomes. */
  @Get('tracked')
  @RequirePlan('ai.suggestions')
  @HttpCode(HttpStatus.OK)
  async getTracked(@CurrentUser() user: JwtUser) {
    const result = await this.aiSuggestionsService.listTracked(user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: AI_MESSAGES.SUCCESS.TRACKED_SUGGESTIONS_RETRIEVED,
      data: result,
    };
  }

  /**
   * POST /ai/suggestions/:id/apply
   *
   * Executes the suggestion's action (send a payment reminder or follow-up,
   * set a revenue target, or reprice upcoming jobs). When the suggestion has
   * a draft, `draftValue` carries the user's edited version and takes
   * precedence over the original.
   */
  @Post(':id/apply')
  @RequirePlan('ai.suggestions')
  @HttpCode(HttpStatus.OK)
  async apply(
    @CurrentUser() user: JwtUser,
    @Param() params: SuggestionIdParamDto,
    @Body() dto: ExecuteSuggestionDto,
  ) {
    const result = await this.aiSuggestionsService.executeSuggestion(
      user.businessId,
      params.id,
      dto.draftValue,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: AI_MESSAGES.SUCCESS.SUGGESTION_EXECUTED,
      data: result,
    };
  }

  /** POST /ai/suggestions/:id/dismiss — hides a suggestion without executing it. */
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
