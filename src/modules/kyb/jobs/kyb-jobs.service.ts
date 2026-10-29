import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'agenda';
import { JOBS } from 'src/common/constants/agenda.constants';
import { AgendaService } from '../../agenda/services/agenda.service';
import { UsersRepository } from '../../users/repositories/users.repository';
import { RegistrationVerificationStatus } from '../../users/schemas/user.schema';
import { PremblyService } from '../services/prembly.service';
import type { VerifyRegistrationJobData } from '../types/kyb.types';

/**
 * Verifies the optional business registration number captured at signup.
 * Runs out-of-band so a slow or failing registry never blocks registration.
 */
@Injectable()
export class KybJobsService implements OnModuleInit {
  private readonly logger = new Logger(KybJobsService.name);

  constructor(
    private readonly agendaService: AgendaService,
    private readonly usersRepository: UsersRepository,
    private readonly premblyService: PremblyService,
  ) {}

  onModuleInit(): void {
    this.agendaService.define(JOBS.KYB_VERIFY_REGISTRATION, (job) =>
      this.handleVerifyRegistration(job as Job<VerifyRegistrationJobData>),
    );
  }

  /** Looks up the user's registration number and records the outcome on the user. */
  async handleVerifyRegistration(
    job: Job<VerifyRegistrationJobData>,
  ): Promise<void> {
    const { userId } = job.attrs.data!;
    const user = await this.usersRepository.findById(userId);
    const registration = user?.businessRegistration;

    if (
      !registration ||
      registration.status !== RegistrationVerificationStatus.PENDING
    ) {
      return;
    }

    let status = RegistrationVerificationStatus.UNAVAILABLE;
    let registeredName: string | undefined;

    if (!this.premblyService.isConfigured) {
      this.logger.warn(
        `KYB skipped — Prembly credentials not configured [userId=${userId}]`,
      );
    } else {
      try {
        const result = await this.premblyService.lookupCompany(
          registration.country,
          registration.number,
          userId,
        );
        status = result.found
          ? RegistrationVerificationStatus.VERIFIED
          : RegistrationVerificationStatus.NOT_FOUND;
        registeredName = result.registeredName;
      } catch (err) {
        this.logger.error(
          `KYB lookup failed [userId=${userId}]: ${err instanceof Error ? err.stack : String(err)}`,
        );
      }
    }

    await this.usersRepository.updateById(userId, {
      businessRegistration: {
        ...registration,
        status,
        registeredName,
        checkedAt: new Date(),
      },
    });
  }
}
