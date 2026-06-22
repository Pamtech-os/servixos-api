import { Injectable, Logger } from '@nestjs/common';
import { JOBS } from 'src/common/constants/agenda.constants';
import { AgendaService } from '../../agenda/services/agenda.service';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { UsersRepository } from '../../users/repositories/users.repository';
import type { NewServiceRequestJobData } from '../../agenda/jobs/email.jobs';

export interface NewServiceRequestNotificationInput {
  businessId: string;
  businessName: string;
  clientName: string;
  service: string;
  requestedDate: Date;
  message?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly agendaService: AgendaService,
    private readonly businessRepository: BusinessRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  /**
   * Fan-out hub for "new service request" notifications.
   * Add new channels (in-app, push) here without touching the caller.
   */
  async onNewServiceRequest(
    input: NewServiceRequestNotificationInput,
  ): Promise<void> {
    try {
      const business = await this.businessRepository.findById(input.businessId);
      if (!business || business.deletedAt) return;

      if (!business.notifications.email) return;

      const owner = await this.usersRepository.findById(
        business.ownerId.toString(),
      );
      if (!owner) return;

      await this.agendaService.now<NewServiceRequestJobData>(
        JOBS.EMAIL_NEW_SERVICE_REQUEST,
        {
          to: owner.email,
          firstName: owner.firstName,
          businessName: input.businessName,
          clientName: input.clientName,
          service: input.service,
          requestedDate: input.requestedDate.toDateString(),
          message: input.message,
        },
      );

      // Future channels:
      // await this.inAppNotificationsService.send({ ... });
      // await this.pushNotificationsService.send({ ... });
    } catch (error) {
      this.logger.error(
        `onNewServiceRequest: failed [businessId=${input.businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
    }
  }
}
