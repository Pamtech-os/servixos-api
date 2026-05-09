import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { JOBS } from 'src/common/constants/agenda.constants';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { ACTIVITY_LOGS_MESSAGES } from 'src/common/constants/messages/activity-logs.messages';
import { CLIENT_AUTH_MESSAGES } from 'src/common/constants/messages/client-auth.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { JwtUser } from 'src/common/decorators/current-user.decorator';
import {
  compareValue,
  generateOtp,
  generateSecureToken,
  hashToken,
  hashValue,
} from 'src/common/utils/hash.util';
import { toBusinessLocalTime } from 'src/common/utils/timezone.util';
import { LogCategory } from '../../activity-logs/schemas/activity-log.schema';
import { PasswordResetJobData } from '../../agenda/jobs/email.jobs';
import { AgendaService } from '../../agenda/services/agenda.service';
import { AuthRepository } from '../../auth/repositories/auth.repository';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { UsersRepository } from '../../users/repositories/users.repository';
import { User, UserRole } from '../../users/schemas/user.schema';
import { ClientForgotPasswordDto } from '../dto/client-forgot-password.dto';
import { ClientLoginDto } from '../dto/client-login.dto';
import { ClientRefreshTokenDto } from '../dto/client-refresh-token.dto';
import { ClientResetPasswordDto } from '../dto/client-reset-password.dto';
import {
  ClientLoginData,
  ClientSessionUserData,
  ClientTokenData,
} from '../types/client-auth.types';

const REFRESH_TOKEN_TTL_DAYS = 7;

@Injectable()
export class ClientAuthService {
  private readonly logger = new Logger(ClientAuthService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly jwtService: JwtService,
    private readonly authRepository: AuthRepository,
    private readonly usersRepository: UsersRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly agendaService: AgendaService,
  ) {}

  async login(
    dto: ClientLoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<
    ClientLoginData | UnauthorizedException | InternalServerErrorException
  > {
    try {
      const user = await this.usersRepository.findByEmail(dto.email);
      if (!this.canAuthenticateClient(user)) {
        this.logger.warn(
          `clientLogin: invalid login attempt [email=${dto.email}]`,
        );
        return new UnauthorizedException(
          CLIENT_AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      const passwordValid = await compareValue(dto.password, user.passwordHash);
      if (!passwordValid) {
        this.logger.warn(
          `clientLogin: invalid password [userId=${user._id.toString()}]`,
        );
        return new UnauthorizedException(
          CLIENT_AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      const businessId = user.businessId;
      const [business, client] = await Promise.all([
        this.businessRepository.findById(businessId.toString()),
        this.clientsRepository.findByUserId(user._id, businessId),
      ]);

      if (!business || business.deletedAt || !client) {
        this.logger.warn(
          `clientLogin: missing profile context [userId=${user._id.toString()}]`,
        );
        return new UnauthorizedException(
          CLIENT_AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      const lastLoginAt = toBusinessLocalTime(new Date(), business.timezone);
      const { accessToken, refreshToken } = await this.issueSession(
        user._id,
        businessId,
        lastLoginAt,
      );

      void this.agendaService.now(JOBS.ACTIVITY_LOG_WRITE, {
        businessId: businessId.toString(),
        actorId: user._id.toString(),
        actorRole: user.userRole,
        action: ACTIVITY_LOGS_MESSAGES.ACTIONS.AUTH.LOGIN,
        category: LogCategory.AUTH,
        ipAddress,
        userAgent,
      });

      return {
        accessToken,
        refreshToken,
        user: this.buildClientSessionUser(user, client, business.timezone),
      };
    } catch (error) {
      this.logger.error(
        `clientLogin: unexpected error [email=${dto.email}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async refreshToken(
    dto: ClientRefreshTokenDto,
  ): Promise<
    ClientTokenData | UnauthorizedException | InternalServerErrorException
  > {
    try {
      const tokenHash = hashToken(dto.refreshToken);
      const stored = await this.authRepository.findValidRefreshToken(tokenHash);

      if (!stored) {
        return new UnauthorizedException(
          CLIENT_AUTH_MESSAGES.ERROR.EXPIRED_TOKEN,
        );
      }

      const [user, business, client] = await Promise.all([
        this.usersRepository.findById(stored.userId.toString()),
        this.businessRepository.findById(stored.businessId.toString()),
        this.clientsRepository.findByUserId(stored.userId, stored.businessId),
      ]);

      if (
        !this.canAuthenticateClient(user) ||
        !business ||
        business.deletedAt ||
        !client
      ) {
        this.logger.warn(
          `clientRefreshToken: invalid session context [userId=${stored.userId.toString()}]`,
        );
        return new UnauthorizedException(
          CLIENT_AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      const accessToken = this.signAccessToken({
        sub: stored.userId.toString(),
        businessId: stored.businessId.toString(),
        userRole: UserRole.CLIENT,
        pinVerified: true,
      });

      return { accessToken };
    } catch (error) {
      this.logger.error(
        `clientRefreshToken: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async logout(
    dto: ClientRefreshTokenDto,
  ): Promise<null | BadRequestException | InternalServerErrorException> {
    try {
      if (!dto.refreshToken) {
        return new BadRequestException(
          CLIENT_AUTH_MESSAGES.ERROR.INVALID_TOKEN,
        );
      }

      const tokenHash = hashToken(dto.refreshToken);
      await this.authRepository.revokeRefreshToken(tokenHash);
      return null;
    } catch (error) {
      this.logger.error(
        `clientLogout: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async forgotPassword(
    dto: ClientForgotPasswordDto,
  ): Promise<null | InternalServerErrorException> {
    try {
      const user = await this.usersRepository.findByEmail(dto.email);

      if (this.canAuthenticateClient(user)) {
        const otp = generateOtp();
        const otpHash = hashToken(otp);
        const expiry = new Date(
          Date.now() + CACHE_TTL.PASSWORD_RESET_TOKEN * 1000,
        );

        await this.usersRepository.updateById(user._id, {
          passwordResetToken: otpHash,
          passwordResetTokenExpiry: expiry,
        });

        await this.agendaService
          .now<PasswordResetJobData>(JOBS.EMAIL_PASSWORD_RESET, {
            to: user.email,
            firstName: user.firstName,
            otp,
          })
          .catch((err: unknown) =>
            this.logger.error(
              `clientForgotPassword: email job failed [email=${dto.email}] ${err instanceof Error ? err.stack : String(err)}`,
            ),
          );
      }

      return null;
    } catch (error) {
      this.logger.error(
        `clientForgotPassword: unexpected error [email=${dto.email}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async resetPassword(
    dto: ClientResetPasswordDto,
  ): Promise<null | BadRequestException | InternalServerErrorException> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const tokenHash = hashToken(dto.otp);
      const user =
        await this.usersRepository.findByPasswordResetToken(tokenHash);

      if (!this.canAuthenticateClient(user)) {
        await session.abortTransaction();
        return new BadRequestException(
          CLIENT_AUTH_MESSAGES.ERROR.INVALID_TOKEN,
        );
      }

      const passwordHash = await hashValue(dto.newPassword);
      await this.usersRepository.updateById(
        user._id,
        {
          passwordHash,
          mustChangePassword: false,
          passwordResetToken: undefined,
          passwordResetTokenExpiry: undefined,
        },
        session,
      );
      await this.authRepository.revokeAllUserRefreshTokens(user._id, session);

      await session.commitTransaction();
      return null;
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      this.logger.error(
        `clientResetPassword: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    } finally {
      await session.endSession();
    }
  }

  async getProfile(
    authorization: string | undefined,
  ): Promise<
    | ClientSessionUserData
    | UnauthorizedException
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const payload = this.verifyClientAuthorizationHeader(authorization);
      if (payload instanceof UnauthorizedException) {
        return payload;
      }

      if (
        !Types.ObjectId.isValid(payload.sub) ||
        !Types.ObjectId.isValid(payload.businessId)
      ) {
        return new UnauthorizedException(
          CLIENT_AUTH_MESSAGES.ERROR.UNAUTHORIZED,
        );
      }

      const userId = new Types.ObjectId(payload.sub);
      const businessId = new Types.ObjectId(payload.businessId);

      const [user, business, client] = await Promise.all([
        this.usersRepository.findById(payload.sub),
        this.businessRepository.findById(payload.businessId),
        this.clientsRepository.findByUserId(userId, businessId),
      ]);

      if (
        !this.canAuthenticateClient(user) ||
        !business ||
        business.deletedAt
      ) {
        return new UnauthorizedException(
          CLIENT_AUTH_MESSAGES.ERROR.UNAUTHORIZED,
        );
      }

      if (!client) {
        return new NotFoundException(
          CLIENT_AUTH_MESSAGES.ERROR.PROFILE_NOT_FOUND,
        );
      }

      return this.buildClientSessionUser(user, client, business.timezone);
    } catch (error) {
      this.logger.error(
        `clientProfile: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Converts a UTC timestamp into business-local wall-clock time before persisting.
   *
   * Example:
   * - utcDate: 2026-05-08T15:00:00.000Z
   * - timezone: America/New_York (UTC-4)
   * - stored: 2026-05-08T11:00:00.000Z
   */
  private verifyClientAuthorizationHeader(
    authorization: string | undefined,
  ): JwtUser | UnauthorizedException {
    const token = this.extractBearerToken(authorization);
    if (!token) {
      return new UnauthorizedException(CLIENT_AUTH_MESSAGES.ERROR.UNAUTHORIZED);
    }

    try {
      const payload = this.jwtService.verify<
        JwtUser & { aud?: string | string[] }
      >(token);
      if (
        !payload?.sub ||
        !payload.businessId ||
        payload.userRole !== UserRole.CLIENT ||
        !this.hasClientAudience(payload.aud)
      ) {
        return new UnauthorizedException(
          CLIENT_AUTH_MESSAGES.ERROR.UNAUTHORIZED,
        );
      }
      return payload;
    } catch {
      return new UnauthorizedException(
        CLIENT_AUTH_MESSAGES.ERROR.EXPIRED_TOKEN,
      );
    }
  }

  private hasClientAudience(audience: string | string[] | undefined): boolean {
    if (!audience) return false;
    if (typeof audience === 'string') return audience === 'client';
    return audience.includes('client');
  }

  private extractBearerToken(authorization?: string): string | null {
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/);
    if (!scheme || !token) return null;
    if (scheme.toLowerCase() !== 'bearer') return null;

    return token;
  }

  private canAuthenticateClient(user: User | null): user is User & {
    businessId: Types.ObjectId;
  } {
    return !!(
      user &&
      !user.deletedAt &&
      user.isActive &&
      user.userRole === UserRole.CLIENT &&
      user.businessId
    );
  }

  private buildClientSessionUser(
    user: User,
    client: {
      _id: Types.ObjectId;
      name: string;
      email: string;
    },
    timezone: string,
  ): ClientSessionUserData {
    return {
      id: user._id.toString(),
      clientId: client._id.toString(),
      name: client.name,
      email: client.email,
      businessId: user.businessId!.toString(),
      timezone,
      mustChangePassword: user.mustChangePassword ?? false,
    };
  }

  private async issueSession(
    userId: Types.ObjectId,
    businessId: Types.ObjectId,
    lastLoginAt: Date,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signAccessToken({
      sub: userId.toString(),
      businessId: businessId.toString(),
      userRole: UserRole.CLIENT,
      pinVerified: true,
    });

    const rawRefreshToken = generateSecureToken(32);
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await Promise.all([
      this.usersRepository.updateById(userId, { lastLoginAt }),
      this.authRepository.createRefreshToken({
        userId,
        businessId,
        tokenHash,
        expiresAt,
      }),
    ]);

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private signAccessToken(payload: JwtUser): string {
    return this.jwtService.sign(payload, { audience: 'client' });
  }
}
