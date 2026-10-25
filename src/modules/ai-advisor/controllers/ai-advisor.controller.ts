import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  HttpException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { RequirePlan } from 'src/common/decorators/require-plan.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';
import { AskAdvisorDto } from '../dto/ask-advisor.dto';
import { AiAdvisorService } from '../services/ai-advisor.service';

/**
 * Serves the AI advisor chat endpoint for the business portal.
 *
 * Route prefix: /api/ai/advisor
 * Gated behind the `ai.advisor` feature (Pro plan — see FEATURE_PLAN_MAP).
 */
@Controller('ai/advisor')
@UseGuards(SubscriptionGuard)
export class AiAdvisorController {
  constructor(private readonly aiAdvisorService: AiAdvisorService) {}

  /**
   * POST /ai/advisor
   *
   * Answers a pricing, marketing, or operations question about the
   * business. Questions outside these three topics are declined without
   * calling the AI. Repeat questions over unchanged business data are
   * served from cache instead of re-querying the AI.
   *
   * Body:
   *   question (required) — the free-form question text, max 500 chars
   *   topic    (optional)  — set by the preset topic buttons to skip
   *                          keyword classification
   */
  @Post()
  @RequirePlan('ai.advisor')
  @HttpCode(HttpStatus.OK)
  async ask(@CurrentUser() user: JwtUser, @Body() dto: AskAdvisorDto) {
    const result = await this.aiAdvisorService.askAdvisor(user.businessId, dto);
    if (result instanceof HttpException) throw result;

    return {
      message: AI_MESSAGES.SUCCESS.ADVISOR_RESPONSE,
      data: result,
    };
  }
}
