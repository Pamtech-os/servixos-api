import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { JOBS } from 'src/common/constants/agenda.constants';
import {
  compareValue,
  generateOtp,
  generateSecureToken,
  hashToken,
  hashValue,
} from 'src/common/utils/hash.util';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { AdminAuthRepository } from '../repositories/admin-auth.repository';
import { AdminRepository } from '../repositories/admin.repository';
import type {
  AdminLoginData,
  AdminJwtPayload,
  AdminOtpPendingData,
  AdminTokenData,
} from '../types/admin.types';
import type { AdminLoginDto } from '../dto/admin-login.dto';
import type { AdminRefreshTokenDto } from '../dto/admin-refresh-token.dto';
import type { VerifyOtpDto } from '../dto/verify-otp.dto';
import type { ChangePasswordDto } from '../dto/change-password.dto';
import type { AdminOtpJobData } from 'src/modules/agenda/jobs/email.jobs';

const REFRESH_TOKEN_TTL_DAYS = 30;
const OTP_TTL_SECONDS = 600; // 10 minutes

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly adminRepository: AdminRepository,
    private readonly adminAuthRepository: AdminAuthRepository,
    private readonly redisService: RedisService,
    private readonly agendaService: AgendaService,
  ) {}

  /** Validate credentials and issue a session or trigger OTP for invited admins. */
  async login(
    dto: AdminLoginDto,
  ): Promise<
    | AdminLoginData
    | AdminOtpPendingData
    | UnauthorizedException
    | InternalServerErrorException
  > {
    try {
      const admin = await this.adminRepository.findByEmail(dto.email);

      if (!admin || !admin.isActive) {
        this.logger.warn(
          `login: admin not found or inactive [email=${dto.email}]`,
        );
        return new UnauthorizedException(
          ADMIN_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      const passwordValid = await compareValue(
        dto.password,
        admin.passwordHash,
      );
      if (!passwordValid) {
        this.logger.warn(
          `login: invalid password [adminId=${admin._id.toString()}]`,
        );
        return new UnauthorizedException(
          ADMIN_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      // Invited admins require OTP verification on every login
      if (admin.isInvited) {
        return await this.initiateOtp(admin);
      }

      const { accessToken, refreshToken } = await this.issueSession(
        admin._id.toString(),
        admin.email,
      );
      await this.adminRepository.updateById(admin._id.toString(), {
        lastLoginAt: new Date(),
      });

      return {
        accessToken,
        refreshToken,
        mustChangePassword: !!admin.mustChangePassword,
        admin: {
          id: admin._id.toString(),
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
        },
      };
    } catch (error) {
      this.logger.error(
        `login: unexpected error [email=${dto.email}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Verify OTP submitted by an invited admin and issue a full session. */
  async verifyOtp(
    dto: VerifyOtpDto,
  ): Promise<
    AdminLoginData | UnauthorizedException | InternalServerErrorException
  > {
    try {
      // Verify the short-lived OTP token
      let payload: AdminJwtPayload & { purpose?: string };
      try {
        payload = this.jwtService.verify<
          AdminJwtPayload & { purpose?: string }
        >(dto.otpToken, {
          audience: 'admin',
        });
      } catch {
        return new UnauthorizedException(ADMIN_MESSAGES.ERROR.INVALID_TOKEN);
      }

      if (payload.purpose !== 'admin-otp') {
        return new UnauthorizedException(ADMIN_MESSAGES.ERROR.INVALID_TOKEN);
      }

      // Retrieve and validate the stored OTP from Redis
      const redisKey = `admin:otp:${payload.sub}`;
      const storedHash = await this.redisService.get(redisKey);
      if (!storedHash) {
        return new UnauthorizedException(ADMIN_MESSAGES.ERROR.OTP_INVALID);
      }

      const otpValid = await compareValue(dto.otp, storedHash);
      if (!otpValid) {
        return new UnauthorizedException(ADMIN_MESSAGES.ERROR.OTP_INVALID);
      }

      // Consume the OTP — one-time use
      await this.redisService.del(redisKey);

      const admin = await this.adminRepository.findById(payload.sub);
      if (!admin || !admin.isActive) {
        return new UnauthorizedException(
          ADMIN_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      const { accessToken, refreshToken } = await this.issueSession(
        admin._id.toString(),
        admin.email,
      );
      await this.adminRepository.updateById(admin._id.toString(), {
        lastLoginAt: new Date(),
      });

      return {
        accessToken,
        refreshToken,
        mustChangePassword: !!admin.mustChangePassword,
        admin: {
          id: admin._id.toString(),
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
        },
      };
    } catch (error) {
      this.logger.error(
        `verifyOtp: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Change the authenticated admin's password and clear mustChangePassword. */
  async changePassword(
    adminId: string,
    dto: ChangePasswordDto,
  ): Promise<
    { changed: true } | BadRequestException | InternalServerErrorException
  > {
    try {
      const admin = await this.adminRepository.findById(adminId);
      if (!admin) {
        return new BadRequestException(
          ADMIN_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      const valid = await compareValue(dto.currentPassword, admin.passwordHash);
      if (!valid) {
        return new BadRequestException(
          ADMIN_MESSAGES.ERROR.CURRENT_PASSWORD_WRONG,
        );
      }

      const newHash = await hashValue(dto.newPassword);
      await this.adminRepository.updateById(adminId, {
        passwordHash: newHash,
        mustChangePassword: false,
      });

      return { changed: true };
    } catch (error) {
      this.logger.error(
        `changePassword: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Rotate the access token using a valid refresh token. */
  async refreshToken(
    dto: AdminRefreshTokenDto,
  ): Promise<
    AdminTokenData | UnauthorizedException | InternalServerErrorException
  > {
    try {
      const tokenHash = hashToken(dto.refreshToken);
      const stored = await this.adminAuthRepository.findValidToken(tokenHash);

      if (!stored) {
        this.logger.warn('refreshToken: token not found or expired');
        return new UnauthorizedException(ADMIN_MESSAGES.ERROR.EXPIRED_TOKEN);
      }

      const admin = await this.adminRepository.findById(
        stored.adminId.toString(),
      );
      if (!admin || !admin.isActive) {
        this.logger.warn(
          `refreshToken: admin not found or inactive [adminId=${stored.adminId.toString()}]`,
        );
        return new UnauthorizedException(
          ADMIN_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      const accessToken = this.signAccessToken(
        admin._id.toString(),
        admin.email,
      );
      return { accessToken };
    } catch (error) {
      this.logger.error(
        `refreshToken: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Revoke the refresh token to log out. */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.adminAuthRepository
      .revokeToken(tokenHash)
      .catch((err: unknown) =>
        this.logger.error(`logout: failed to revoke token: ${String(err)}`),
      );
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Generate OTP, cache it in Redis, send email, and return the pending response. */
  private async initiateOtp(admin: {
    _id: { toString(): string };
    firstName: string;
    email: string;
  }): Promise<AdminOtpPendingData> {
    const otp = generateOtp();
    const hashedOtp = await hashValue(otp);
    const adminId = admin._id.toString();

    await this.redisService.set(
      `admin:otp:${adminId}`,
      hashedOtp,
      OTP_TTL_SECONDS,
    );

    await this.agendaService.now<AdminOtpJobData>(JOBS.EMAIL_ADMIN_OTP, {
      to: admin.email,
      firstName: admin.firstName,
      otp,
    });

    // Short-lived token — carries no session privileges, only identifies the pending OTP session
    const otpToken = this.jwtService.sign(
      {
        sub: adminId,
        email: admin.email,
        purpose: 'admin-otp',
      } as AdminJwtPayload & { purpose: string },
      { expiresIn: '10m', audience: 'admin' },
    );

    return { requiresOtp: true, otpToken };
  }

  private async issueSession(
    adminId: string,
    email: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signAccessToken(adminId, email);

    const rawRefreshToken = generateSecureToken(32);
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.adminAuthRepository.createRefreshToken({
      adminId: new Types.ObjectId(adminId),
      tokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private signAccessToken(adminId: string, email: string): string {
    const payload: AdminJwtPayload = { sub: adminId, email, aud: 'admin' };
    return this.jwtService.sign(payload);
  }
}
