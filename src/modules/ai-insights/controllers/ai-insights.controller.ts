import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  HttpException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { RequirePlan } from 'src/common/decorators/require-plan.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';
import { ListInsightsDto } from '../dto/list-insights.dto';
import { AiInsightsService } from '../services/ai-insights.service';

/**
 * Serves AI-generated business insight cards for the business portal.
 *
 * Route prefix: /api/ai/insights
 * Gated behind the `ai.insights` feature (available on every plan, including
 * Starter — see FEATURE_PLAN_MAP).
 */
@Controller('ai/insights')
@UseGuards(SubscriptionGuard)
export class AiInsightsController {
  constructor(private readonly aiInsightsService: AiInsightsService) {}

  /**
   * GET /ai/insights
   *
   * Returns every insight category with its count (for the filter tabs) plus
   * the insights list, filtered by `category`/`severity` if provided.
   *
   * Insights are only regenerated via AI when the underlying business data
   * has actually changed (see AiInsightsService for the fingerprint cache) —
   * repeat requests over unchanged data never spend AI tokens.
   *
   * Query params:
   *   category (optional) — revenue | clients | operations | growth
   *   severity (optional) — high | medium | low
   */
  @Get()
  @RequirePlan('ai.insights')
  @HttpCode(HttpStatus.OK)
  async getInsights(
    @CurrentUser() user: JwtUser,
    @Query() query: ListInsightsDto,
  ) {
    const result = await this.aiInsightsService.generateInsights(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: AI_MESSAGES.SUCCESS.INSIGHTS_GENERATED,
      data: result,
    };
  }
}
