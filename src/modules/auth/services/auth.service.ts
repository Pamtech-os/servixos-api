import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { BUSINESS_CATEGORIES_MESSAGES } from 'src/common/constants/messages/business-categories.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import {
  getFeaturesForPlan,
  TRIAL_PERIOD_DAYS,
} from 'src/common/constants/subscription-features.constants';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from 'src/modules/business/schemas/business.schema';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import {
  JwtUser,
  TokenScope,
} from 'src/common/decorators/current-user.decorator';
import {
  compareValue,
  generateOtp,
  generateSecureToken,
  hashToken,
  hashValue,
} from 'src/common/utils/hash.util';
import { toBusinessLocalTime } from 'src/common/utils/timezone.util';
import { AuthRepository } from '../repositories/auth.repository';
import {
  LoginData,
  OnboardingNextStep,
  OnboardingStatusData,
  TokenData,
} from '../types/auth.types';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { CreateAccountDto } from '../dto/create-account.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ResendOtpDto } from '../dto/resend-otp.dto';
import { SetPinDto } from '../dto/set-pin.dto';
import { CompleteSetupDto } from '../dto/complete-setup.dto';
import { CreateBusinessDto } from '../dto/create-business.dto';
import { UsersRepository } from '../../users/repositories/users.repository';
import { BusinessRepository } from '../../business/repositories/business.repository';
import {
  ALL_PERMISSIONS,
  Permission,
} from 'src/common/constants/permissions.constants';
import { RolesRepository } from '../../roles/repositories/roles.repository';
import { WebsiteConfigRepository } from '../../website/repositories/website-config.repository';
import { BusinessCategoriesRepository } from '../../business-categories/repositories/business-categories.repository';
import { AgendaService } from '../../agenda/services/agenda.service';
import { JOBS } from 'src/common/constants/agenda.constants';
import {
  EmailVerificationJobData,
  PasswordResetJobData,
} from '../../agenda/jobs/email.jobs';
import { RedisService } from '../../redis/services/redis.service';
import {
  OnboardingStage,
  RegistrationVerificationStatus,
  User,
  UserRole,
} from '../../users/schemas/user.schema';
import type { VerifyRegistrationJobData } from '../../kyb/types/kyb.types';
import { LogCategory } from '../../activity-logs/schemas/activity-log.schema';
import { ACTIVITY_LOGS_MESSAGES } from 'src/common/constants/messages/activity-logs.messages';
import { isInternalStaffRole } from 'src/common/utils/user-role.util';

const PIN_MAX_ATTEMPTS = 3;

const ONBOARDING_NEXT_STEP: Record<OnboardingStage, OnboardingNextStep> = {
  [OnboardingStage.REGISTERED]: OnboardingNextStep.VERIFY_EMAIL,
  [OnboardingStage.EMAIL_VERIFIED]: OnboardingNextStep.SET_PIN,
  [OnboardingStage.PIN_SET]: OnboardingNextStep.BUSINESS_DISCOVERY,
  [OnboardingStage.BUSINESS_CREATED]: OnboardingNextStep.PAYMENT_METHOD,
  [OnboardingStage.PAYMENT_METHOD_ADDED]: OnboardingNextStep.DASHBOARD,
  [OnboardingStage.COMPLETE]: OnboardingNextStep.DASHBOARD,
};

/** Users created before onboardingStage existed have it derived from their data. */
function resolveOnboardingStage(user: User): OnboardingStage {
  if (user.onboardingStage) return user.onboardingStage;
  if (user.businessId) return OnboardingStage.COMPLETE;
  if (user.pinHash) return OnboardingStage.PIN_SET;
  if (user.isEmailVerified) return OnboardingStage.EMAIL_VERIFIED;
  return OnboardingStage.REGISTERED;
}
const REFRESH_TOKEN_TTL_DAYS = 7;
const CLIENT_TOKEN_KEY = (token: string) => `client_token:${token}`;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly jwtService: JwtService,
    private readonly authRepository: AuthRepository,
    private readonly usersRepository: UsersRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly websiteConfigRepository: WebsiteConfigRepository,
    private readonly businessCategoriesRepository: BusinessCategoriesRepository,
    private readonly agendaService: AgendaService,
    private readonly redisService: RedisService,
  ) {}

  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginData | UnauthorizedException | InternalServerErrorException> {
    try {
      const user = await this.usersRepository.findByEmail(dto.email);
      if (!user || (!user.isActive && !this.canResumeOnboarding(user))) {
        this.logger.warn(
          `login: user not found or inactive [email=${dto.email}]`,
        );
        return new UnauthorizedException(
          AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      const passwordValid = await compareValue(dto.password, user.passwordHash);
      if (!passwordValid) {
        this.logger.warn(
          `login: invalid password [userId=${user._id.toString()}]`,
        );
        return new UnauthorizedException(
          AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      if (!user.businessId) {
        return await this.issueOnboardingSession(user);
      }

      const userId = user._id;
      const businessId = user.businessId;

      const business = await this.businessRepository.findById(
        businessId.toString(),
      );
      const timezone = business?.timezone ?? 'UTC';

      const { accessToken, refreshToken } = await this.issueSession(
        userId,
        businessId,
        user.userRole,
        timezone,
        user.roleId,
      );

      void this.agendaService.now(JOBS.ACTIVITY_LOG_WRITE, {
        businessId: businessId.toString(),
        actorId: userId.toString(),
        actorRole: user.userRole,
        action: ACTIVITY_LOGS_MESSAGES.ACTIONS.AUTH.LOGIN,
        category: LogCategory.AUTH,
        ipAddress,
        userAgent,
      });

      return {
        accessToken,
        refreshToken,
        user: {
          id: userId.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          businessId: businessId.toString(),
          mustChangePassword: user.mustChangePassword ?? false,
        },
      };
    } catch (error) {
      this.logger.error(
        `login: unexpected error [email=${dto.email}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async verifyPin(
    authorization: string | undefined,
    pin: string,
  ): Promise<TokenData | UnauthorizedException | InternalServerErrorException> {
    try {
      const token = authorization?.replace('Bearer ', '');
      if (!token) {
        this.logger.warn('verifyPin: missing authorization header');
        return new UnauthorizedException(AUTH_MESSAGES.ERROR.UNAUTHORIZED);
      }

      let payload: JwtUser;
      try {
        payload = this.jwtService.verify<JwtUser>(token);
      } catch (err) {
        this.logger.warn(
          `JWT verification failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return new UnauthorizedException(AUTH_MESSAGES.ERROR.EXPIRED_TOKEN);
      }

      const attemptsKey = `pin_attempts:${payload.sub}`;

      const [attemptsRaw, user] = await Promise.all([
        this.redisService.get(attemptsKey),
        this.usersRepository.findById(payload.sub),
      ]);

      const attempts = parseInt(attemptsRaw ?? '0', 10);

      if (attempts >= PIN_MAX_ATTEMPTS) {
        this.logger.warn(
          `verifyPin: account locked after max attempts [userId=${payload.sub}]`,
        );
        return new UnauthorizedException(AUTH_MESSAGES.ERROR.PIN_LOCKED);
      }

      if (!user || !user.isActive) {
        this.logger.warn(
          `verifyPin: user not found or inactive [userId=${payload.sub}]`,
        );
        return new UnauthorizedException(
          AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      if (!user.pinHash) {
        this.logger.warn(
          `verifyPin: no PIN set for user [userId=${payload.sub}]`,
        );
        return new UnauthorizedException(
          AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      const pinValid = await compareValue(pin, user.pinHash);
      if (!pinValid) {
        const next = attempts + 1;
        await this.redisService.set(
          attemptsKey,
          String(next),
          CACHE_TTL.PIN_ATTEMPT,
        );
        this.logger.warn(
          `verifyPin: invalid PIN [userId=${payload.sub}] attempt=${next}/${PIN_MAX_ATTEMPTS}`,
        );
        return new UnauthorizedException(AUTH_MESSAGES.ERROR.INVALID_PIN);
      }

      await Promise.all([
        this.redisService.del(attemptsKey),
        this.authRepository.markUserTokensPinVerified(user._id),
      ]);

      const permissions = await this.resolvePermissions(
        user.userRole,
        user.roleId,
      );
      const accessToken = this.signAccessToken({
        sub: payload.sub,
        businessId: payload.businessId,
        userRole: payload.userRole,
        pinVerified: true,
        permissions,
      });

      return { accessToken };
    } catch (error) {
      this.logger.error(
        `verifyPin: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async completeSetup(
    authorization: string | undefined,
    dto: CompleteSetupDto,
  ): Promise<
    | TokenData
    | BadRequestException
    | UnauthorizedException
    | InternalServerErrorException
  > {
    try {
      const token = authorization?.replace('Bearer ', '');
      if (!token) {
        this.logger.warn('completeSetup: missing authorization header');
        return new UnauthorizedException(AUTH_MESSAGES.ERROR.UNAUTHORIZED);
      }

      let payload: JwtUser;
      try {
        payload = this.jwtService.verify<JwtUser>(token);
      } catch (err) {
        this.logger.warn(
          `completeSetup: JWT verification failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return new UnauthorizedException(AUTH_MESSAGES.ERROR.EXPIRED_TOKEN);
      }

      const user = await this.usersRepository.findById(payload.sub);
      if (!user || !user.isActive || user.deletedAt) {
        this.logger.warn(
          `completeSetup: user not found or inactive [userId=${payload.sub}]`,
        );
        return new UnauthorizedException(
          AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      if (!isInternalStaffRole(user.userRole) || !user.mustChangePassword) {
        return new BadRequestException(AUTH_MESSAGES.ERROR.SETUP_NOT_REQUIRED);
      }

      const businessId = user.businessId?.toString() ?? payload.businessId;
      if (!businessId) {
        this.logger.warn(
          `completeSetup: missing business scope [userId=${payload.sub}]`,
        );
        return new UnauthorizedException(AUTH_MESSAGES.ERROR.UNAUTHORIZED);
      }

      const [passwordHash, pinHash] = await Promise.all([
        hashValue(dto.newPassword),
        hashValue(dto.pin),
      ]);

      await Promise.all([
        this.usersRepository.updateById(user._id, {
          passwordHash,
          pinHash,
          mustChangePassword: false,
        }),
        this.authRepository.revokeAllUserRefreshTokens(user._id),
      ]);

      const permissions = await this.resolvePermissions(
        user.userRole,
        user.roleId,
      );
      const accessToken = this.signAccessToken({
        sub: user._id.toString(),
        businessId,
        userRole: user.userRole,
        pinVerified: true,
        permissions,
      });

      return { accessToken };
    } catch (error) {
      this.logger.error(
        `completeSetup: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async refreshToken(
    dto: RefreshTokenDto,
  ): Promise<TokenData | UnauthorizedException | InternalServerErrorException> {
    try {
      const oldTokenHash = hashToken(dto.refreshToken ?? '');
      const stored =
        await this.authRepository.findValidRefreshToken(oldTokenHash);

      if (!stored) {
        this.logger.warn('refreshToken: token not found or expired');
        return new UnauthorizedException(AUTH_MESSAGES.ERROR.EXPIRED_TOKEN);
      }

      const user = await this.usersRepository.findById(
        stored.userId.toString(),
      );
      // Onboarding sessions upgrade to full scope once the business has been created
      const businessId = stored.businessId ?? user?.businessId;
      const isEligible = businessId
        ? !!user?.isActive
        : !!user && this.canResumeOnboarding(user);

      if (!user || !isEligible) {
        this.logger.warn(
          `refreshToken: user not found or inactive [userId=${stored.userId.toString()}]`,
        );
        return new UnauthorizedException(
          AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
        );
      }

      const rawRefreshToken = generateSecureToken(32);
      const newTokenHash = hashToken(rawRefreshToken);
      const expiresAt = new Date(
        Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
      );

      const accessToken = businessId
        ? this.signAccessToken({
            sub: stored.userId.toString(),
            businessId: businessId.toString(),
            userRole: user.userRole,
            pinVerified: stored.pinVerified ?? false,
            permissions: await this.resolvePermissions(
              user.userRole,
              user.roleId,
            ),
          })
        : this.signOnboardingAccessToken(user);

      // Rotate: revoke old token and persist new one atomically, carrying pinVerified forward
      await Promise.all([
        this.authRepository.revokeRefreshToken(oldTokenHash),
        this.authRepository.createRefreshToken({
          userId: stored.userId,
          ...(businessId && { businessId }),
          tokenHash: newTokenHash,
          expiresAt,
          pinVerified: stored.pinVerified ?? false,
        }),
      ]);

      return { accessToken, refreshToken: rawRefreshToken };
    } catch (error) {
      this.logger.error(
        `refreshToken: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async logout(
    refreshToken: string,
  ): Promise<null | BadRequestException | InternalServerErrorException> {
    try {
      if (!refreshToken) {
        this.logger.warn('logout: missing refresh token');
        return new BadRequestException(AUTH_MESSAGES.ERROR.INVALID_TOKEN);
      }

      const tokenHash = hashToken(refreshToken);
      await this.authRepository.revokeRefreshToken(tokenHash);

      return null;
    } catch (error) {
      this.logger.error(
        `logout: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<null | InternalServerErrorException> {
    try {
      const user = await this.usersRepository.findByEmail(dto.email);

      if (user) {
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
              `Email job "${JOBS.EMAIL_PASSWORD_RESET}" failed: ${err instanceof Error ? err.stack : String(err)}`,
            ),
          );
      }

      return null;
    } catch (error) {
      this.logger.error(
        `forgotPassword: unexpected error [email=${dto.email}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<null | BadRequestException | InternalServerErrorException> {
    try {
      const tokenHash = hashToken(dto.otp);
      const user =
        await this.usersRepository.findByPasswordResetToken(tokenHash);

      if (!user) {
        this.logger.warn('resetPassword: invalid or expired reset OTP');
        return new BadRequestException(AUTH_MESSAGES.ERROR.INVALID_TOKEN);
      }

      const passwordHash = await hashValue(dto.newPassword);

      await Promise.all([
        this.usersRepository.updateById(user._id, {
          passwordHash,
          mustChangePassword: false,
          passwordResetToken: undefined,
          passwordResetTokenExpiry: undefined,
        }),
        this.authRepository.revokeAllUserRefreshTokens(user._id),
      ]);

      return null;
    } catch (error) {
      this.logger.error(
        `resetPassword: unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async createAccount(
    dto: CreateAccountDto,
  ): Promise<null | ConflictException | InternalServerErrorException> {
    try {
      const [existing, passwordHash] = await Promise.all([
        this.usersRepository.findByEmail(dto.email),
        hashValue(dto.password),
      ]);

      if (existing) {
        this.logger.warn(
          `createAccount: email already registered [email=${dto.email}]`,
        );
        return new ConflictException(AUTH_MESSAGES.ERROR.EMAIL_TAKEN);
      }

      const otp = generateOtp();
      const otpHash = hashToken(otp);
      const expiry = new Date(Date.now() + CACHE_TTL.EMAIL_OTP * 1000);

      const user = await this.usersRepository.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        country: dto.country,
        userRole: UserRole.OWNER,
        isActive: false,
        isEmailVerified: false,
        onboardingStage: OnboardingStage.REGISTERED,
        emailVerificationOtp: otpHash,
        emailVerificationOtpExpiry: expiry,
        ...(dto.businessRegistrationNumber && {
          businessRegistration: {
            number: dto.businessRegistrationNumber,
            country: dto.country,
            status: RegistrationVerificationStatus.PENDING,
          },
        }),
      });

      if (dto.businessRegistrationNumber) {
        void this.agendaService
          .now<VerifyRegistrationJobData>(JOBS.KYB_VERIFY_REGISTRATION, {
            userId: user._id.toString(),
          })
          .catch((err: unknown) =>
            this.logger.error(
              `Job "${JOBS.KYB_VERIFY_REGISTRATION}" failed to enqueue: ${err instanceof Error ? err.stack : String(err)}`,
            ),
          );
      }

      await this.agendaService
        .now<EmailVerificationJobData>(JOBS.EMAIL_VERIFICATION, {
          to: dto.email,
          firstName: dto.firstName,
          otp,
        })
        .catch((err: unknown) =>
          this.logger.error(
            `Email job "${JOBS.EMAIL_VERIFICATION}" failed: ${err instanceof Error ? err.stack : String(err)}`,
          ),
        );

      return null;
    } catch (error) {
      // Two concurrent requests can both pass the findByEmail check then race to
      // insert — the second hits the unique index. Treat it as a conflict, not a 500.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: number }).code === 11000
      ) {
        return new ConflictException(AUTH_MESSAGES.ERROR.EMAIL_TAKEN);
      }
      this.logger.error(
        `createAccount: unexpected error [email=${dto.email}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Validates the email OTP and opens an onboarding session so the owner can continue signed in. */
  async verifyEmail(
    dto: VerifyEmailDto,
  ): Promise<LoginData | BadRequestException | InternalServerErrorException> {
    try {
      const user = await this.usersRepository.findByEmail(dto.email);

      if (!user || user.isEmailVerified) {
        this.logger.warn(
          `verifyEmail: ${!user ? 'user not found' : 'already verified'} [email=${dto.email}]`,
        );
        return new BadRequestException(AUTH_MESSAGES.ERROR.INVALID_OTP);
      }

      const otpHash = hashToken(dto.otp);
      const isValid =
        user.emailVerificationOtp === otpHash &&
        user.emailVerificationOtpExpiry != null &&
        user.emailVerificationOtpExpiry > new Date();

      if (!isValid) {
        this.logger.warn(
          `verifyEmail: invalid or expired OTP [userId=${user._id.toString()}]`,
        );
        return new BadRequestException(AUTH_MESSAGES.ERROR.INVALID_OTP);
      }

      const verified = await this.usersRepository.updateById(user._id, {
        isEmailVerified: true,
        onboardingStage: OnboardingStage.EMAIL_VERIFIED,
        emailVerificationOtp: undefined,
        emailVerificationOtpExpiry: undefined,
      });

      return await this.issueOnboardingSession(verified ?? user);
    } catch (error) {
      this.logger.error(
        `verifyEmail: unexpected error [email=${dto.email}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async resendEmailOtp(
    dto: ResendOtpDto,
  ): Promise<null | InternalServerErrorException> {
    try {
      const user = await this.usersRepository.findByEmail(dto.email);

      // Always return null — prevents callers from probing whether an email
      // is registered or already verified (OWASP enumeration prevention)
      if (!user || user.isEmailVerified) {
        return null;
      }

      const otp = generateOtp();
      const otpHash = hashToken(otp);
      const expiry = new Date(Date.now() + CACHE_TTL.EMAIL_OTP * 1000);

      await this.usersRepository.updateById(user._id, {
        emailVerificationOtp: otpHash,
        emailVerificationOtpExpiry: expiry,
      });

      await this.agendaService
        .now<EmailVerificationJobData>(JOBS.EMAIL_VERIFICATION, {
          to: user.email,
          firstName: user.firstName,
          otp,
        })
        .catch((err: unknown) =>
          this.logger.error(
            `Email job "${JOBS.EMAIL_VERIFICATION}" failed: ${err instanceof Error ? err.stack : String(err)}`,
          ),
        );

      return null;
    } catch (error) {
      this.logger.error(
        `resendEmailOtp: unexpected error [email=${dto.email}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Sets the owner's 4-digit PIN during onboarding (before a business exists). */
  async setPin(
    userId: string,
    dto: SetPinDto,
  ): Promise<
    | null
    | BadRequestException
    | ConflictException
    | InternalServerErrorException
  > {
    try {
      const user = await this.usersRepository.findById(userId);
      if (!user) {
        this.logger.warn(`setPin: user not found [userId=${userId}]`);
        return new BadRequestException(AUTH_MESSAGES.ERROR.ACCOUNT_NOT_FOUND);
      }

      // Once a business exists, PIN changes must go through a flow that checks the current PIN
      if (user.businessId) {
        this.logger.warn(`setPin: business already exists [userId=${userId}]`);
        return new ConflictException(
          AUTH_MESSAGES.ERROR.BUSINESS_ALREADY_SETUP,
        );
      }

      if (!user.isEmailVerified) {
        this.logger.warn(
          `setPin: email not verified [userId=${user._id.toString()}]`,
        );
        return new BadRequestException(AUTH_MESSAGES.ERROR.EMAIL_NOT_VERIFIED);
      }

      const pinHash = await hashValue(dto.pin);
      await this.usersRepository.updateById(user._id, {
        pinHash,
        onboardingStage: OnboardingStage.PIN_SET,
      });

      return null;
    } catch (error) {
      this.logger.error(
        `setPin: unexpected error [userId=${userId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Creates the owner's business from the setup form, activates the account and upgrades the session to full scope. */
  async createBusiness(
    userId: string,
    dto: CreateBusinessDto,
  ): Promise<ProvisionBusinessResult> {
    return this.provisionBusiness(userId, {
      businessName: dto.businessName,
      categoryId: dto.businessCategory,
      description: dto.businessDescription,
      colorPrimary: dto.colorPrimary,
      colorSecondary: dto.colorSecondary,
      font: dto.font,
      services: dto.services,
      timezone: dto.timezone,
      plan: dto.plan,
      billingInterval: dto.billingInterval,
    });
  }

  /**
   * Creates a business for a verified owner in one transaction (business, roles,
   * website config, activation), then issues a full-scope session. Shared by the
   * setup form and AI discovery approval.
   */
  async provisionBusiness(
    userId: string,
    input: BusinessProvisionInput,
  ): Promise<ProvisionBusinessResult> {
    try {
      const base = this.generateSubdomain(input.businessName);

      const [user, category, subdomain] = await Promise.all([
        this.usersRepository.findById(userId),
        this.businessCategoriesRepository.findById(input.categoryId),
        this.findAvailableSubdomain(base),
      ]);

      if (!user) {
        this.logger.warn(
          `provisionBusiness: user not found [userId=${userId}]`,
        );
        return new BadRequestException(AUTH_MESSAGES.ERROR.ACCOUNT_NOT_FOUND);
      }

      if (!user.isEmailVerified) {
        this.logger.warn(
          `provisionBusiness: email not verified [userId=${user._id.toString()}]`,
        );
        return new BadRequestException(AUTH_MESSAGES.ERROR.EMAIL_NOT_VERIFIED);
      }

      if (!user.pinHash) {
        this.logger.warn(
          `provisionBusiness: PIN not set [userId=${user._id.toString()}]`,
        );
        return new BadRequestException(AUTH_MESSAGES.ERROR.PIN_NOT_SET);
      }

      if (user.businessId) {
        this.logger.warn(
          `provisionBusiness: business already exists [userId=${user._id.toString()}]`,
        );
        return new ConflictException(
          AUTH_MESSAGES.ERROR.BUSINESS_ALREADY_SETUP,
        );
      }

      if (!category) {
        this.logger.warn(
          `provisionBusiness: invalid category [categoryId=${input.categoryId}]`,
        );
        return new BadRequestException(
          BUSINESS_CATEGORIES_MESSAGES.ERROR.NOT_FOUND,
        );
      }

      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_PERIOD_DAYS);

      const { businessId } = await this.runBusinessOnboardingTransaction(
        input,
        user,
        subdomain,
        category.name,
        trialEndsAt,
      );

      // Retire onboarding-scoped refresh tokens now that a full session exists
      await this.authRepository.revokeAllUserRefreshTokens(user._id);
      const { accessToken, refreshToken } = await this.issueSession(
        user._id,
        businessId,
        user.userRole,
        input.timezone ?? 'UTC',
        user.roleId,
      );

      await this.agendaService
        .now(JOBS.EMAIL_WELCOME, { to: user.email, firstName: user.firstName })
        .catch((err: unknown) =>
          this.logger.error(
            `Email job "${JOBS.EMAIL_WELCOME}" failed: ${err instanceof Error ? err.stack : String(err)}`,
          ),
        );

      void this.agendaService
        .now<TaskStagesBootstrapJobData>(JOBS.TASK_STAGES_BOOTSTRAP, {
          businessId: businessId.toString(),
        })
        .catch((err: unknown) =>
          this.logger.error(
            `Job "${JOBS.TASK_STAGES_BOOTSTRAP}" failed to enqueue: ${err instanceof Error ? err.stack : String(err)}`,
          ),
        );

      // Async: create Stripe customer + subscription with a 7-day trial
      void this.agendaService
        .now(JOBS.SUBSCRIPTION_SETUP_STRIPE_CUSTOMER, {
          businessId: businessId.toString(),
          email: user.email,
          name: input.businessName,
          plan: input.plan ?? SubscriptionPlan.STARTER,
          billingInterval: input.billingInterval ?? 'monthly',
        })
        .catch((err: unknown) =>
          this.logger.error(
            `Job "${JOBS.SUBSCRIPTION_SETUP_STRIPE_CUSTOMER}" failed to enqueue: ${err instanceof Error ? err.stack : String(err)}`,
          ),
        );

      return {
        accessToken,
        refreshToken,
        user: {
          id: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          businessId: businessId.toString(),
          mustChangePassword: user.mustChangePassword ?? false,
          subdomain,
        },
      };
    } catch (error) {
      this.logger.error(
        `provisionBusiness: unexpected error [userId=${userId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async runBusinessOnboardingTransaction(
    input: BusinessProvisionInput,
    owner: User,
    subdomain: string,
    categoryName: string,
    trialEndsAt: Date,
  ): Promise<{ businessId: Types.ObjectId }> {
    const session = await this.connection.startSession();
    session.startTransaction();

    const ownerId = owner._id;
    try {
      const business = await this.businessRepository.create(
        {
          ownerId,
          name: input.businessName,
          subdomain,
          categoryId: new Types.ObjectId(input.categoryId),
          categoryName,
          description: input.description,
          country: owner.country,
          ...(owner.businessRegistration && {
            registration: owner.businessRegistration,
          }),
          colors: {
            primary: input.colorPrimary ?? '#2563eb',
            secondary: input.colorSecondary ?? '#64748b',
          },
          font: input.font ?? 'Inter',
          services: input.services ?? [],
          timezone: input.timezone ?? 'UTC',
          subscription: {
            plan: SubscriptionPlan.STARTER,
            status: SubscriptionStatus.TRIALING,
            trialEndsAt,
            features: getFeaturesForPlan(SubscriptionPlan.STARTER),
            hasPaymentMethod: false,
          },
        },
        session,
      );

      const businessId = business._id;
      const roles = await this.rolesRepository.createDefaultRoles(
        businessId,
        session,
      );
      const ownerRoleId = roles.owner._id;

      await this.websiteConfigRepository.create(
        {
          businessId,
          colorPrimary: input.colorPrimary ?? '#2563eb',
          colorSecondary: input.colorSecondary ?? '#64748b',
          font: input.font ?? 'Inter',
        },
        session,
      );

      await this.usersRepository.updateById(
        ownerId,
        {
          businessId,
          roleId: ownerRoleId,
          isActive: true,
          onboardingStage: OnboardingStage.BUSINESS_CREATED,
        },
        session,
      );

      await session.commitTransaction();
      return { businessId };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  private generateSubdomain(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async findAvailableSubdomain(base: string): Promise<string> {
    const taken = new Set(
      await this.businessRepository.findSubdomainsStartingWith(base),
    );

    if (!taken.has(base)) return base;

    for (let i = 1; i <= 100; i++) {
      const candidate = `${base}-${i}`;
      if (!taken.has(candidate)) return candidate;
    }

    return `${base}-${Date.now()}`;
  }

  private async issueSession(
    userId: Types.ObjectId,
    businessId: Types.ObjectId,
    userRole: UserRole,
    timezone = 'UTC',
    roleId?: Types.ObjectId,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const permissions = await this.resolvePermissions(userRole, roleId);
    const accessToken = this.signAccessToken({
      sub: userId.toString(),
      businessId: businessId.toString(),
      userRole,
      pinVerified: false,
      permissions,
    });

    const rawRefreshToken = generateSecureToken(32);
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await Promise.all([
      this.usersRepository.updateById(userId, {
        lastLoginAt: toBusinessLocalTime(new Date(), timezone),
      }),
      this.authRepository.createRefreshToken({
        userId,
        businessId,
        tokenHash,
        expiresAt,
      }),
    ]);

    return { accessToken, refreshToken: rawRefreshToken };
  }

  /** Returns where the user is in the onboarding journey so the client can resume at the right step. */
  async getOnboardingStatus(
    userId: string,
  ): Promise<OnboardingStatusData | UnauthorizedException> {
    const user = await this.usersRepository.findById(userId);
    if (!user || user.deletedAt) {
      return new UnauthorizedException(AUTH_MESSAGES.ERROR.UNAUTHORIZED);
    }

    const stage = resolveOnboardingStage(user);
    const registration = user.businessRegistration;

    return {
      stage,
      nextStep: ONBOARDING_NEXT_STEP[stage],
      firstName: user.firstName,
      email: user.email,
      country: user.country,
      hasPin: !!user.pinHash,
      businessId: user.businessId?.toString() ?? null,
      businessRegistration: registration
        ? {
            number: registration.number,
            status: registration.status,
            registeredName: registration.registeredName,
          }
        : null,
    };
  }

  async issueClientToken(): Promise<{ token: string; expiresAt: number }> {
    const token = generateSecureToken();
    const ttl = CACHE_TTL.CLIENT_TOKEN;
    await this.redisService.set(CLIENT_TOKEN_KEY(token), '1', ttl);
    return { token, expiresAt: Date.now() + ttl * 1_000 };
  }

  private async resolvePermissions(
    userRole: UserRole,
    roleId?: Types.ObjectId,
  ): Promise<Permission[]> {
    if (userRole === UserRole.OWNER) return [...ALL_PERMISSIONS];
    if (roleId) {
      const role = await this.rolesRepository.findById(roleId.toString());
      if (role?.permissions.length) return role.permissions;
    }
    return [];
  }

  private signAccessToken(payload: JwtUser): string {
    return this.jwtService.sign(payload);
  }

  /** Verified owners without a business may sign in with an onboarding-scoped session. */
  private canResumeOnboarding(user: User): boolean {
    return (
      user.userRole === UserRole.OWNER &&
      user.isEmailVerified &&
      !user.businessId &&
      !user.deletedAt
    );
  }

  private signOnboardingAccessToken(user: User): string {
    return this.signAccessToken({
      sub: user._id.toString(),
      businessId: '',
      userRole: user.userRole,
      pinVerified: false,
      permissions: [],
      scope: TokenScope.ONBOARDING,
    });
  }

  private async issueOnboardingSession(user: User): Promise<LoginData> {
    const rawRefreshToken = generateSecureToken(32);
    await this.authRepository.createRefreshToken({
      userId: user._id,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt: new Date(
        Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
      ),
    });

    return {
      accessToken: this.signOnboardingAccessToken(user),
      refreshToken: rawRefreshToken,
      user: {
        id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        businessId: null,
        mustChangePassword: false,
        onboardingStage: resolveOnboardingStage(user),
      },
    };
  }
}

export interface BusinessProvisionInput {
  businessName: string;
  categoryId: string;
  description?: string;
  colorPrimary?: string;
  colorSecondary?: string;
  font?: string;
  services?: string[];
  timezone: string;
  plan?: SubscriptionPlan;
  billingInterval?: 'monthly' | 'yearly';
}

export type ProvisionBusinessResult =
  | LoginData
  | BadRequestException
  | ConflictException
  | InternalServerErrorException;

interface TaskStagesBootstrapJobData {
  businessId: string;
}
