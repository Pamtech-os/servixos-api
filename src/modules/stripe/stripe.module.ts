import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { AgendaModule } from '../agenda/agenda.module';
import { StripeService } from './services/stripe.service';
import { StripeWebhookController } from './webhooks/stripe-webhook.controller';
import { StripeWebhookService } from './webhooks/stripe-webhook.service';

@Module({
  imports: [RedisModule, AgendaModule],
  controllers: [StripeWebhookController],
  providers: [StripeService, StripeWebhookService],
  exports: [StripeService],
})
export class StripeModule {}
