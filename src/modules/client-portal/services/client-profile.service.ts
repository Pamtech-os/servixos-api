import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CLIENT_CACHE_KEYS } from 'src/client/constants/cache-keys';
import { CLIENT_CACHE_TTLS } from 'src/client/constants/cache-ttls';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { compareValue, hashValue } from 'src/common/utils/hash.util';
import { AuthRepository } from '../../auth/repositories/auth.repository';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { RedisService } from '../../redis/services/redis.service';
import { UsersRepository } from '../../users/repositories/users.repository';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';

@Injectable()
export class ClientProfileService {
  private readonly logger = new Logger(ClientProfileService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly authRepository: AuthRepository,
    private readonly redisService: RedisService,
  ) {}

  async getProfile(
    businessId: string,
    clientId: string,
    userId: string,
  ): Promise<
    | {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone?: string;
        avatarUrl: null;
        isEmailVerified: boolean;
        lastLoginAt?: string;
        serviceProvider: {
          id: string;
          businessName: string;
        };
      }
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const cacheKey = CLIENT_CACHE_KEYS.profile(clientId);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as {
          id: string;
          email: string;
          firstName: string;
          lastName: string;
          phone?: string;
          avatarUrl: null;
          isEmailVerified: boolean;
          lastLoginAt?: string;
          serviceProvider: {
            id: string;
            businessName: string;
          };
        };
      }

      const [user, business] = await Promise.all([
        this.usersRepository.findById(userId),
        this.businessRepository.findById(businessId),
      ]);

      if (!user || !business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const profile = {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        avatarUrl: null,
        isEmailVerified: user.isEmailVerified,
        lastLoginAt: user.lastLoginAt?.toISOString(),
        serviceProvider: {
          id: business._id.toString(),
          businessName: business.name,
        },
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(profile), CLIENT_CACHE_TTLS.PROFILE)
        .catch(() => undefined);

      return profile;
    } catch (error) {
      this.logger.error(
        `getProfile: failed [businessId=${businessId}, userId=${userId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async updateProfile(
    clientId: string,
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<
    | {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone?: string;
        avatarUrl: null;
        isEmailVerified: boolean;
        lastLoginAt?: string;
      }
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const updated = await this.usersRepository.updateById(userId, {
        ...(dto.firstName !== undefined && { firstName: dto.firstName.trim() }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName.trim() }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
      });

      if (!updated) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      await this.redisService
        .del(CLIENT_CACHE_KEYS.profile(clientId))
        .catch(() => undefined);

      return {
        id: updated._id.toString(),
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        phone: updated.phone,
        avatarUrl: null,
        isEmailVerified: updated.isEmailVerified,
        lastLoginAt: updated.lastLoginAt?.toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `updateProfile: failed [userId=${userId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<
    | null
    | BadRequestException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      if (dto.newPassword !== dto.confirmPassword) {
        return new BadRequestException(
          CLIENT_MESSAGES.AUTH.ERROR.PASSWORD_MISMATCH,
        );
      }

      const user = await this.usersRepository.findById(userId);
      if (!user) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const currentPasswordValid = await compareValue(
        dto.currentPassword,
        user.passwordHash,
      );
      if (!currentPasswordValid) {
        return new BadRequestException(
          CLIENT_MESSAGES.AUTH.ERROR.CURRENT_PASSWORD_WRONG,
        );
      }

      const sameAsCurrent = await compareValue(
        dto.newPassword,
        user.passwordHash,
      );
      if (sameAsCurrent) {
        return new BadRequestException(
          CLIENT_MESSAGES.AUTH.ERROR.SAME_PASSWORD,
        );
      }

      const passwordHash = await hashValue(dto.newPassword);
      await Promise.all([
        this.usersRepository.updateById(userId, { passwordHash }),
        this.authRepository.revokeAllUserRefreshTokens(user._id),
      ]);

      return null;
    } catch (error) {
      this.logger.error(
        `changePassword: failed [userId=${userId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }
}
