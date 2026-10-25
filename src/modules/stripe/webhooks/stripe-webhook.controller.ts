import {
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { SkipChannel } from 'src/common/decorators/channel.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { StripeService } from '../services/stripe.service';
import { StripeWebhookService } from './stripe-webhook.service';
import type { StripeWebhookEvent } from './stripe-webhook.service';

@Public()
@SkipSignature()
@SkipChannel()
@SkipThrottle()
@Controller('stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    config: ConfigService,
    private readonly stripeService: StripeService,
    private readonly webhookService: StripeWebhookService,
  ) {
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET')!;
  }

  /**
   * Stripe calls this endpoint for every billing event.
   * Raw body is required for signature verification — express.raw() middleware
   * is applied to this route in main.ts before the global json() middleware.
   */
  @Post('webhook')
  @HttpCode(200)
  handleWebhook(@Req() req: Request): { received: boolean } {
    const signature = req.headers['stripe-signature'];

    if (!signature || typeof signature !== 'string') {
      this.logger.warn('Stripe webhook received without signature header');
      throw new BadRequestException(COMMON_MESSAGES.ERROR.BAD_REQUEST);
    }

    let event: StripeWebhookEvent;
    try {
      // req.body is a Buffer because express.raw() is applied to this route
      event = this.stripeService.constructEvent(
        req.body as Buffer,
        signature,
        this.webhookSecret,
      ) as unknown as StripeWebhookEvent;
    } catch {
      // Never log the raw body — it may contain PCI-scoped card data
      this.logger.warn('Stripe webhook signature verification failed');
      throw new BadRequestException(COMMON_MESSAGES.ERROR.BAD_REQUEST);
    }

    // Dispatch asynchronously — never await so Stripe gets 200 immediately
    void this.webhookService.handle(event).catch((err: unknown) => {
      this.logger.error(
        `Webhook dispatch error for event ${event.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return { received: true };
  }
}
