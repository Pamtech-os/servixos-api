import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticsRepository } from './repositories/analytics.repository';
import { AnalyticsService } from './services/analytics.service';

/**
 * Analytics module — read-only aggregation endpoints for the business portal.
 *
 * Dependencies:
 *   BusinessModule — provides BusinessRepository (for timezone lookup)
 *   RedisModule    — global module, injected automatically
 *
 * The AnalyticsRepository instantiates its own Typegoose models (PageView,
 * Payment, Job, Invoice, ActivityLog, ServiceRequest) directly from the shared
 * Mongoose connection, keeping the module self-contained without needing to
 * import every upstream module.
 */
@Module({
  imports: [BusinessModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsRepository, AnalyticsService],
})
export class AnalyticsModule {}
