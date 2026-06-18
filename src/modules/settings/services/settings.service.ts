import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { SETTINGS_MESSAGES } from 'src/common/constants/messages/settings.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { compareValue, hashValue } from 'src/common/utils/hash.util';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { UsersRepository } from '../../users/repositories/users.repository';
import { AuthRepository } from '../../auth/repositories/auth.repository';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UpdateNotificationsDto } from '../dto/update-notifications.dto';
import { UpdatePasswordDto } from '../dto/update-password.dto';
import type { ServiceResponse } from 'src/common/dto/response.dto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly businessRepository: BusinessRepository,
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  /** Returns the business profile fields displayed on the Business settings tab. */
  async getProfile(businessId: string): Promise<ServiceResponse> {
    const business = await this.businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundException(SETTINGS_MESSAGES.ERROR.PROFILE_NOT_FOUND);
    }

    return {
      message: SETTINGS_MESSAGES.SUCCESS.PROFILE_RETRIEVED,
      data: {
        name: business.name,
        categoryName: business.categoryName,
        email: business.email ?? null,
        phone: business.phone ?? null,
        address: business.address ?? null,
        description: business.description ?? null,
      },
    };
  }

  /** Updates editable business profile fields. */
  async updateProfile(
    businessId: string,
    dto: UpdateProfileDto,
  ): Promise<
    ServiceResponse | NotFoundException | InternalServerErrorException
  > {
    try {
      const business = await this.businessRepository.findById(businessId);
      if (!business) {
        return new NotFoundException(SETTINGS_MESSAGES.ERROR.PROFILE_NOT_FOUND);
      }

      const update: Record<string, unknown> = {};
      if (dto.name !== undefined) update.name = dto.name;
      if (dto.email !== undefined) update.email = dto.email;
      if (dto.phone !== undefined) update.phone = dto.phone;
      if (dto.address !== undefined) update.address = dto.address;
      if (dto.description !== undefined) update.description = dto.description;

      await this.businessRepository.updateById(businessId, update);

      return { message: SETTINGS_MESSAGES.SUCCESS.PROFILE_UPDATED };
    } catch (error) {
      this.logger.error(
        `updateProfile: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Returns the notification preferences for the business. */
  async getNotifications(businessId: string): Promise<ServiceResponse> {
    const business = await this.businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundException(SETTINGS_MESSAGES.ERROR.PROFILE_NOT_FOUND);
    }

    return {
      message: SETTINGS_MESSAGES.SUCCESS.NOTIFICATIONS_RETRIEVED,
      data: business.notifications,
    };
  }

  /** Updates notification preference toggles for the business. */
  async updateNotifications(
    businessId: string,
    dto: UpdateNotificationsDto,
  ): Promise<
    ServiceResponse | NotFoundException | InternalServerErrorException
  > {
    try {
      const business = await this.businessRepository.findById(businessId);
      if (!business) {
        return new NotFoundException(SETTINGS_MESSAGES.ERROR.PROFILE_NOT_FOUND);
      }

      const update: Record<string, unknown> = {};
      if (dto.email !== undefined) update['notifications.email'] = dto.email;
      if (dto.newClient !== undefined)
        update['notifications.newClient'] = dto.newClient;
      if (dto.payment !== undefined)
        update['notifications.payment'] = dto.payment;

      await this.businessRepository.updateById(businessId, update);

      return { message: SETTINGS_MESSAGES.SUCCESS.NOTIFICATIONS_UPDATED };
    } catch (error) {
      this.logger.error(
        `updateNotifications: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Changes the authenticated user's password after verifying the current one. */
  async updatePassword(
    userId: string,
    dto: UpdatePasswordDto,
  ): Promise<
    | ServiceResponse
    | UnauthorizedException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const user = await this.usersRepository.findById(userId);
      if (!user) {
        return new NotFoundException(SETTINGS_MESSAGES.ERROR.PROFILE_NOT_FOUND);
      }

      const isValid = await compareValue(
        dto.currentPassword,
        user.passwordHash,
      );
      if (!isValid) {
        return new UnauthorizedException(
          SETTINGS_MESSAGES.ERROR.INVALID_PASSWORD,
        );
      }

      const passwordHash = await hashValue(dto.newPassword);
      await this.usersRepository.updateById(user._id, { passwordHash });

      return { message: SETTINGS_MESSAGES.SUCCESS.PASSWORD_UPDATED };
    } catch (error) {
      this.logger.error(
        `updatePassword: unexpected error [userId=${userId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Permanently soft-deletes the business account and all associated user data.
   * Revokes all active sessions before marking records as deleted.
   */
  async deleteAccount(
    userId: string,
    businessId: string,
  ): Promise<
    ServiceResponse | NotFoundException | InternalServerErrorException
  > {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const user = await this.usersRepository.findById(userId);
      if (!user) {
        await session.abortTransaction();
        return new NotFoundException(SETTINGS_MESSAGES.ERROR.PROFILE_NOT_FOUND);
      }

      await Promise.all([
        this.usersRepository.softDeleteById(user._id, session),
        this.businessRepository.softDeleteById(businessId, session),
        this.authRepository.revokeAllUserRefreshTokens(user._id, session),
      ]);

      await session.commitTransaction();

      return { message: SETTINGS_MESSAGES.SUCCESS.ACCOUNT_DELETED };
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(
        `deleteAccount: unexpected error [userId=${userId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }
}
