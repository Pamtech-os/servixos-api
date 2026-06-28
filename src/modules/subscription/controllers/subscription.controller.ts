import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { AllowLocked } from 'src/common/decorators/allow-locked.decorator';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { SubscriptionService } from '../services/subscription.service';
import { SubscribeDto } from '../dto/subscribe.dto';
import { UpgradeDto } from '../dto/upgrade.dto';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /** Lists all active plans — no auth required (shown on marketing/signup pages). */
  @Public()
  @Get('plans')
  getPlans() {
    return this.subscriptionService.getPlans();
  }

  /**
   * Creates a Stripe SetupIntent clientSecret.
   * The frontend passes this to Stripe.js to collect a card without charging.
   * @AllowLocked lets locked businesses update their card before paying the outstanding invoice.
   */
  @Post('setup-intent')
  @HttpCode(HttpStatus.OK)
  @AllowLocked()
  createSetupIntent(@CurrentUser() user: JwtUser) {
    return this.subscriptionService.createSetupIntent(user.businessId);
  }

  /**
   * Creates a Stripe Subscription with a 30-day free trial on the chosen plan.
   * An optional paymentMethodId attaches the card upfront for seamless conversion.
   */
  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  subscribe(@CurrentUser() user: JwtUser, @Body() dto: SubscribeDto) {
    return this.subscriptionService.subscribe(user.businessId, dto);
  }

  /**
   * Upgrades the current subscription to a higher-tier plan.
   * Stripe prorates the difference and invoices immediately.
   */
  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  async upgrade(@CurrentUser() user: JwtUser, @Body() dto: UpgradeDto) {
    const result = await this.subscriptionService.upgrade(user.businessId, dto);
    if (
      result instanceof BadRequestException ||
      result instanceof NotFoundException ||
      result instanceof InternalServerErrorException
    ) {
      throw result;
    }
    return result;
  }

  /** Schedules cancellation at the end of the current billing period. */
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser() user: JwtUser) {
    const result = await this.subscriptionService.cancel(user.businessId);
    if (result instanceof NotFoundException) throw result;
    return result;
  }

  /**
   * Returns the client_secret for the outstanding invoice's PaymentIntent.
   * Used by the grace-period and locked-account "Pay now" flow.
   * @AllowLocked lets LOCKED businesses call this endpoint.
   */
  @Post('pay-now')
  @HttpCode(HttpStatus.OK)
  @AllowLocked()
  async payNow(@CurrentUser() user: JwtUser) {
    const result = await this.subscriptionService.getPayNowClientSecret(
      user.businessId,
    );
    if (
      result instanceof NotFoundException ||
      result instanceof InternalServerErrorException
    ) {
      throw result;
    }
    return result;
  }

  /** Paginated billing transaction history. */
  @Get('transactions')
  getTransactions(@CurrentUser() user: JwtUser, @Query() dto: PaginationDto) {
    return this.subscriptionService.getTransactions(user.businessId, dto);
  }
}
