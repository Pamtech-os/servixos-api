import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AdminSubscriptionsRepository } from '../repositories/admin-subscriptions.repository';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';

@Injectable()
export class AdminSubscriptionsService {
  private readonly logger = new Logger(AdminSubscriptionsService.name);

  constructor(
    private readonly subscriptionsRepo: AdminSubscriptionsRepository,
  ) {}

  /** Retrieve all subscription analytics: stats, MRR chart, plan distribution, recent plan changes. */
  async getSubscriptionAnalytics() {
    try {
      const [stats, mrrHistory, planDistribution, recentPlanChanges] =
        await Promise.all([
          this.subscriptionsRepo.getStats(),
          this.subscriptionsRepo.getMrrHistory(6),
          this.subscriptionsRepo.getPlanDistribution(),
          this.subscriptionsRepo.getRecentPlanChanges(10),
        ]);

      return { stats, mrrHistory, planDistribution, recentPlanChanges };
    } catch (error) {
      this.logger.error(
        `getSubscriptionAnalytics: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }
}
