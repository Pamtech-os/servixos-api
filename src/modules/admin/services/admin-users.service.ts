import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { JOBS } from 'src/common/constants/agenda.constants';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import {
  generateOtp,
  generateStrongPassword,
  hashToken,
  hashValue,
} from 'src/common/utils/hash.util';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { AdminUsersRepository } from '../repositories/admin-users.repository';
import { QueryAdminUsersDto } from '../dto/query-users.dto';
import { InviteUserDto } from '../dto/invite-user.dto';
import {
  BulkSendEmailDto,
  BulkToggleSuspendDto,
  SendEmailToUserDto,
} from '../dto/send-email.dto';
import type {
  AdminCustomEmailJobData,
  AdminInvitationJobData,
  PasswordResetJobData,
} from 'src/modules/agenda/jobs/email.jobs';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);
  private readonly appUrl: string;

  constructor(
    private readonly adminUsersRepository: AdminUsersRepository,
    private readonly usersRepository: UsersRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly agendaService: AgendaService,
    private readonly config: ConfigService,
  ) {
    this.appUrl = this.config.get<string>('APP_URL') || 'http://localhost:3000';
  }

  /** Paginated list of users with stats header. */
  async listUsers(dto: QueryAdminUsersDto) {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const [{ data, total }, stats] = await Promise.all([
        this.adminUsersRepository.findAll(
          { search: dto.search, status: dto.status, role: dto.role },
          pagination,
        ),
        this.adminUsersRepository.getStats(),
      ]);

      return {
        stats,
        users: data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };
    } catch (error) {
      this.logger.error(
        `listUsers: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Full user profile enriched with business name. */
  async getUserById(
    id: string,
  ): Promise<object | NotFoundException | InternalServerErrorException> {
    try {
      const user = await this.adminUsersRepository.findByIdWithBusiness(id);
      if (!user)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.USER_NOT_FOUND);
      return user;
    } catch (error) {
      this.logger.error(
        `getUserById: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Suspend or reactivate a single user. */
  async toggleSuspend(
    id: string,
  ): Promise<
    { suspended: boolean } | NotFoundException | InternalServerErrorException
  > {
    try {
      const user = await this.usersRepository.findById(id);
      if (!user)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.USER_NOT_FOUND);

      const newState = !user.isActive;
      await this.adminUsersRepository.updateById(id, { isActive: newState });

      return { suspended: !newState };
    } catch (error) {
      this.logger.error(
        `toggleSuspend: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Toggle suspend/reactivate for a batch of users. */
  async bulkToggleSuspend(
    dto: BulkToggleSuspendDto,
  ): Promise<{ modifiedCount: number } | InternalServerErrorException> {
    try {
      const users = await this.adminUsersRepository.findManyByIds(dto.userIds);
      if (!users.length) {
        return { modifiedCount: 0 };
      }

      // If caller specifies explicit state, use it; otherwise invert each user's current state.
      // For bulk with mixed states, default to suspending all (most common admin action).
      const shouldSuspend =
        dto.suspend !== undefined ? dto.suspend : users.some((u) => u.isActive); // if any active, suspend all

      const modifiedCount = await this.adminUsersRepository.updateManyByIds(
        users.map((u) => u._id.toString()),
        { isActive: !shouldSuspend },
      );

      return { modifiedCount };
    } catch (error) {
      this.logger.error(
        `bulkToggleSuspend: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Create a user account and send an invitation email with a temporary password. */
  async inviteUser(
    dto: InviteUserDto,
  ): Promise<
    null | ConflictException | NotFoundException | InternalServerErrorException
  > {
    try {
      const existing = await this.usersRepository.findByEmail(dto.email);
      if (existing) {
        return new ConflictException(ADMIN_MESSAGES.ERROR.EMAIL_TAKEN);
      }

      let businessId: import('mongoose').Types.ObjectId | undefined;

      if (dto.businessName) {
        const business = await this.businessRepository.findByName(
          dto.businessName,
        );
        if (!business) {
          return new NotFoundException(ADMIN_MESSAGES.ERROR.BUSINESS_NOT_FOUND);
        }
        businessId = business._id;
      }

      const nameParts = dto.fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || nameParts[0];

      const temporaryPassword = generateStrongPassword();
      const passwordHash = await hashValue(temporaryPassword);

      await this.usersRepository.create({
        firstName,
        lastName,
        email: dto.email,
        passwordHash,
        userRole: dto.role,
        businessId,
        isActive: true,
        isEmailVerified: true,
        mustChangePassword: true,
      });

      const loginUrl = `${this.appUrl.replace(/\/$/, '')}/login`;

      void this.agendaService
        .now<AdminInvitationJobData>(JOBS.EMAIL_ADMIN_INVITATION, {
          to: dto.email,
          firstName,
          temporaryPassword,
          loginUrl,
        })
        .catch((err: unknown) =>
          this.logger.error(
            `inviteUser: invitation email failed [email=${dto.email}]: ${String(err)}`,
          ),
        );

      return null;
    } catch (error) {
      this.logger.error(
        `inviteUser: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Send a custom admin email to a single user. */
  async sendEmailToUser(
    userId: string,
    dto: SendEmailToUserDto,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const user = await this.usersRepository.findById(userId);
      if (!user)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.USER_NOT_FOUND);

      void this.agendaService
        .now<AdminCustomEmailJobData>(JOBS.EMAIL_ADMIN_CUSTOM, {
          to: user.email,
          recipientName: user.firstName,
          subject: dto.subject,
          message: dto.message,
        })
        .catch((err: unknown) =>
          this.logger.error(
            `sendEmailToUser: job failed [userId=${userId}]: ${String(err)}`,
          ),
        );

      return null;
    } catch (error) {
      this.logger.error(
        `sendEmailToUser: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Send a custom admin email to multiple users in parallel. */
  async bulkSendEmail(
    dto: BulkSendEmailDto,
  ): Promise<{ sent: number } | InternalServerErrorException> {
    try {
      const users = await this.adminUsersRepository.findManyByIds(dto.userIds);

      // Dispatch all email jobs in parallel; failures are logged individually
      await Promise.all(
        users.map((user) =>
          this.agendaService
            .now<AdminCustomEmailJobData>(JOBS.EMAIL_ADMIN_CUSTOM, {
              to: user.email,
              recipientName: user.firstName,
              subject: dto.subject,
              message: dto.message,
            })
            .catch((err: unknown) =>
              this.logger.error(
                `bulkSendEmail: job failed [userId=${user._id.toString()}]: ${String(err)}`,
              ),
            ),
        ),
      );

      return { sent: users.length };
    } catch (error) {
      this.logger.error(
        `bulkSendEmail: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Trigger a password reset OTP email for a user. */
  async resetUserPassword(
    userId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const user = await this.usersRepository.findById(userId);
      if (!user)
        return new NotFoundException(ADMIN_MESSAGES.ERROR.USER_NOT_FOUND);

      const otp = generateOtp();
      const otpHash = hashToken(otp);
      const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 min

      await this.usersRepository.updateById(user._id, {
        passwordResetToken: otpHash,
        passwordResetTokenExpiry: expiry,
      });

      void this.agendaService
        .now<PasswordResetJobData>(JOBS.EMAIL_PASSWORD_RESET, {
          to: user.email,
          firstName: user.firstName,
          otp,
        })
        .catch((err: unknown) =>
          this.logger.error(
            `resetUserPassword: email job failed [userId=${userId}]: ${String(err)}`,
          ),
        );

      return null;
    } catch (error) {
      this.logger.error(
        `resetUserPassword: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }
}
