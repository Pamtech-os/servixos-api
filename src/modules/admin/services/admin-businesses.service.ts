import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { JOBS } from 'src/common/constants/agenda.constants';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { AdminBusinessesRepository } from '../repositories/admin-businesses.repository';
import { QueryAdminBusinessesDto } from '../dto/query-businesses.dto';
import {
  BulkBusinessIdsDto,
  BulkBusinessSendEmailDto,
  SendEmailToUserDto,
} from '../dto/send-email.dto';
import type { AdminCustomEmailJobData } from 'src/modules/agenda/jobs/email.jobs';

@Injectable()
export class AdminBusinessesService {
  private readonly logger = new Logger(AdminBusinessesService.name);

  constructor(
    private readonly adminBusinessesRepository: AdminBusinessesRepository,
    private readonly agendaService: AgendaService,
  ) {}

  /** Paginated list of businesses with owner info. */
  async listBusinesses(dto: QueryAdminBusinessesDto) {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const { data, total } = await this.adminBusinessesRepository.findAll(
        { search: dto.search, status: dto.status },
        pagination,
      );
      return {
        businesses: data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    } catch (error) {
      this.logger.error(
        `listBusinesses: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Full business profile with owner details. */
  async getBusinessById(
    id: string,
  ): Promise<object | NotFoundException | InternalServerErrorException> {
    try {
      const business =
        await this.adminBusinessesRepository.findByIdWithOwner(id);
      if (!business)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.BUSINESS_NOT_FOUND);
      return business;
    } catch (error) {
      this.logger.error(
        `getBusinessById: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Suspend a business and deactivate all its staff.
   * When suspended, TenantGuard blocks all requests from this business.
   */
  async suspendBusiness(
    id: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const business =
        await this.adminBusinessesRepository.findByIdWithOwner(id);
      if (!business)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.BUSINESS_NOT_FOUND);

      await Promise.all([
        this.adminBusinessesRepository.updateById(id, {
          isSuspended: true,
          suspendedAt: new Date(),
        }),
        this.adminBusinessesRepository.deactivateAllStaff([id]),
      ]);

      return null;
    } catch (error) {
      this.logger.error(
        `suspendBusiness: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Reactivate a suspended business and restore all its staff accounts. */
  async reactivateBusiness(
    id: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const business =
        await this.adminBusinessesRepository.findByIdWithOwner(id);
      if (!business)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.BUSINESS_NOT_FOUND);

      await Promise.all([
        this.adminBusinessesRepository.updateById(id, {
          isSuspended: false,
          suspendedAt: undefined,
        }),
        this.adminBusinessesRepository.reactivateAllStaff([id]),
      ]);

      return null;
    } catch (error) {
      this.logger.error(
        `reactivateBusiness: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Bulk toggle suspend: if any business in the batch is active, suspend all;
   * otherwise reactivate all.
   */
  async bulkToggleSuspend(
    dto: BulkBusinessIdsDto,
  ): Promise<
    { modifiedCount: number; suspended: boolean } | InternalServerErrorException
  > {
    try {
      const businesses = await this.adminBusinessesRepository.findManyByIds(
        dto.businessIds,
      );
      if (!businesses.length) return { modifiedCount: 0, suspended: false };

      const shouldSuspend = businesses.some((b) => !b.isSuspended);
      const ids = businesses.map((b) => b._id.toString());

      const [modifiedCount] = await Promise.all([
        this.adminBusinessesRepository.updateManyByIds(ids, {
          isSuspended: shouldSuspend,
          suspendedAt: shouldSuspend ? new Date() : undefined,
        }),
        shouldSuspend
          ? this.adminBusinessesRepository.deactivateAllStaff(ids)
          : this.adminBusinessesRepository.reactivateAllStaff(ids),
      ]);

      return { modifiedCount, suspended: shouldSuspend };
    } catch (error) {
      this.logger.error(
        `bulkToggleSuspend: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Send custom admin email to a business owner. */
  async sendEmailToBusiness(
    businessId: string,
    dto: SendEmailToUserDto,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const business =
        await this.adminBusinessesRepository.findByIdWithOwner(businessId);
      if (!business)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.BUSINESS_NOT_FOUND);

      void this.agendaService
        .now<AdminCustomEmailJobData>(JOBS.EMAIL_ADMIN_CUSTOM, {
          to: business.ownerEmail,
          recipientName: business.ownerFirstName,
          subject: dto.subject,
          message: dto.message,
        })
        .catch((err: unknown) =>
          this.logger.error(
            `sendEmailToBusiness: job failed [businessId=${businessId}]: ${String(err)}`,
          ),
        );

      return null;
    } catch (error) {
      this.logger.error(
        `sendEmailToBusiness: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Send custom email to owners of multiple businesses in parallel. */
  async bulkSendEmail(
    dto: BulkBusinessSendEmailDto,
  ): Promise<{ sent: number } | InternalServerErrorException> {
    try {
      const businesses = await this.adminBusinessesRepository.findManyByIds(
        dto.businessIds,
      );

      await Promise.all(
        businesses
          .filter((b) => b.ownerEmail)
          .map((b) =>
            this.agendaService
              .now<AdminCustomEmailJobData>(JOBS.EMAIL_ADMIN_CUSTOM, {
                to: b.ownerEmail!,
                recipientName: b.ownerFirstName ?? b.name,
                subject: dto.subject,
                message: dto.message,
              })
              .catch((err: unknown) =>
                this.logger.error(
                  `bulkSendEmail: job failed [businessId=${b._id.toString()}]: ${String(err)}`,
                ),
              ),
          ),
      );

      return { sent: businesses.length };
    } catch (error) {
      this.logger.error(
        `bulkSendEmail: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }
}
