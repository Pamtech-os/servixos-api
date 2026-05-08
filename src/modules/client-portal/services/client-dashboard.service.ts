import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CLIENT_CACHE_KEYS } from 'src/client/constants/cache-keys';
import { CLIENT_CACHE_TTLS } from 'src/client/constants/cache-ttls';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { InvoicesRepository } from '../../invoices/repositories/invoices.repository';
import { ContractsRepository } from '../../jobs/repositories/contracts.repository';
import { ContractStatus } from '../../jobs/schemas/contract.schema';
import { RedisService } from '../../redis/services/redis.service';
import { ClientActivitiesService } from './client-activities.service';
import { ClientDashboardData } from '../types/client-portal.types';

@Injectable()
export class ClientDashboardService {
  private readonly logger = new Logger(ClientDashboardService.name);

  constructor(
    private readonly invoicesRepository: InvoicesRepository,
    private readonly contractsRepository: ContractsRepository,
    private readonly activitiesService: ClientActivitiesService,
    private readonly redisService: RedisService,
  ) {}

  async getDashboard(
    businessId: string,
    clientId: string,
  ): Promise<ClientDashboardData | InternalServerErrorException> {
    try {
      const cacheKey = CLIENT_CACHE_KEYS.dashboard(clientId);
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as ClientDashboardData;

      const [invoiceSummary, pendingContractsCount, recentActivities] =
        await Promise.all([
          this.invoicesRepository.getClientInvoiceSummary(
            new Types.ObjectId(businessId),
            new Types.ObjectId(clientId),
          ),
          this.contractsRepository.countForClient(
            new Types.ObjectId(businessId),
            new Types.ObjectId(clientId),
            ContractStatus.SENT,
          ),
          this.activitiesService.listRecentActivities(businessId, clientId, 10),
        ]);

      const data: ClientDashboardData = {
        outstandingBalance: this.toMinorUnits(
          invoiceSummary.outstandingBalance,
        ),
        totalPaid: this.toMinorUnits(invoiceSummary.totalPaid),
        pendingContractsCount,
        recentActivities,
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(data), CLIENT_CACHE_TTLS.DASHBOARD)
        .catch(() => undefined);

      return data;
    } catch (error) {
      this.logger.error(
        `getDashboard: failed [businessId=${businessId}, clientId=${clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private toMinorUnits(amount: number): number {
    return Math.round((amount ?? 0) * 100);
  }
}
