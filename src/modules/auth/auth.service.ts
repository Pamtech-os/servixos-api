import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { BUSINESS_CATEGORIES_MESSAGES } from 'src/common/constants/messages/business-categories.messages';
import { getFeaturesForPlan } from 'src/common/constants/subscription-features.constants';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from 'src/modules/business/schemas/business.schema';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { JwtUser } from 'src/common/decorators/current-user.decorator';
import { ServiceResponse } from 'src/common/dto/response.dto';
import {
  compareValue,
  generateOtp,
  generateSecureToken,
  hashToken,
  hashValue,
} from 'src/common/utils/hash.util';
import { AuthRepository } from './auth.repository';
import { LoginData, TokenData } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UsersRepository } from '../users/users.repository';
import { BusinessRepository } from '../business/business.repository';
import { RolesRepository } from '../roles/roles.repository';
import { WebsiteConfigRepository } from '../website/website-config.repository';
import { BusinessCategoriesRepository } from '../business-categories/business-categories.repository';
import { AgendaService } from '../agenda/agenda.service';
import { JOBS } from '../agenda/agenda.constants';
import {
  EmailVerificationJobData,
  PasswordResetJobData,
} from '../agenda/jobs/email.jobs';
import { RedisService } from '../redis/redis.service';
import { UserRole } from '../users/schemas/user.schema';

const PIN_MAX_ATTEMPTS = 3;
const REFRESH_TOKEN_TTL_DAYS = 7;

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

  /** Validates credentials and issues an access + refresh token pair. */
  async login(dto: LoginDto): Promise<ServiceResponse<LoginData>> {
    const user = await this.usersRepository.findByEmail(dto.email);
    if (!user || !user.isActive) {
      this.logger.warn(
        `login: user not found or inactive [email=${dto.email}]`,
      );
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    const passwordValid = await compareValue(dto.password, user.passwordHash);
    if (!passwordValid) {
      this.logger.warn(
        `login: invalid password [userId=${user._id.toString()}]`,
      );
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    const userId = user._id;
    const businessId = user.businessId!;

    const { accessToken, refreshToken } = await this.issueSession(
      userId,
      businessId,
      user.userRole,
    );

    return {
      message: AUTH_MESSAGES.SUCCESS.LOGIN,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: userId.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          businessId: businessId.toString(),
        },
      },
    };
  }

  /** Upgrades the access token to pinVerified=true after the user enters the correct PIN. */
  async verifyPin(
    authorization: string | undefined,
    pin: string,
  ): Promise<ServiceResponse<TokenData>> {
    const token = authorization?.replace('Bearer ', '');
    if (!token) {
      this.logger.warn('verifyPin: missing authorization header');
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.UNAUTHORIZED);
    }

    let payload: JwtUser;
    try {
      payload = this.jwtService.verify<JwtUser>(token);
    } catch (err) {
      this.logger.warn(
        `JWT verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.EXPIRED_TOKEN);
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
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.PIN_LOCKED);
    }

    if (!user || !user.isActive) {
      this.logger.warn(
        `verifyPin: user not found or inactive [userId=${payload.sub}]`,
      );
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    if (!user.pinHash) {
      this.logger.warn(
        `verifyPin: no PIN set for user [userId=${payload.sub}]`,
      );
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
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
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.INVALID_PIN);
    }

    await this.redisService.del(attemptsKey);

    const accessToken = this.signAccessToken({
      sub: payload.sub,
      businessId: payload.businessId,
      userRole: payload.userRole,
      pinVerified: true,
    });

    return {
      message: AUTH_MESSAGES.SUCCESS.PIN_VERIFIED,
      data: { accessToken },
    };
  }

  /** Issues a new access token using a valid, non-expired refresh token. */
  async refreshToken(
    dto: RefreshTokenDto,
  ): Promise<ServiceResponse<TokenData>> {
    const tokenHash = hashToken(dto.refreshToken);
    const stored = await this.authRepository.findValidRefreshToken(tokenHash);

    if (!stored) {
      this.logger.warn('refreshToken: token not found or expired');
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.EXPIRED_TOKEN);
    }

    const user = await this.usersRepository.findById(stored.userId.toString());
    if (!user || !user.isActive) {
      this.logger.warn(
        `refreshToken: user not found or inactive [userId=${stored.userId.toString()}]`,
      );
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    const accessToken = this.signAccessToken({
      sub: stored.userId.toString(),
      businessId: stored.businessId.toString(),
      userRole: user.userRole,
      pinVerified: false,
    });

    return {
      message: AUTH_MESSAGES.SUCCESS.TOKEN_REFRESHED,
      data: { accessToken },
    };
  }

  /** Revokes the given refresh token, ending the current session. */
  async logout(refreshToken: string): Promise<ServiceResponse<null>> {
    if (!refreshToken) {
      this.logger.warn('logout: missing refresh token');
      throw new BadRequestException(AUTH_MESSAGES.ERROR.INVALID_TOKEN);
    }

    const tokenHash = hashToken(refreshToken);
    await this.authRepository.revokeRefreshToken(tokenHash);

    return { message: AUTH_MESSAGES.SUCCESS.LOGOUT };
  }

  /** Sends a password-reset OTP to the address if an account exists — always returns 200 to prevent enumeration. */
  async forgotPassword(dto: ForgotPasswordDto): Promise<ServiceResponse<null>> {
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

    return { message: AUTH_MESSAGES.SUCCESS.PASSWORD_RESET_SENT };
  }

  /** Validates the OTP and updates the password, then revokes all active sessions. */
  async resetPassword(dto: ResetPasswordDto): Promise<ServiceResponse<null>> {
    const tokenHash = hashToken(dto.otp);
    const user = await this.usersRepository.findByPasswordResetToken(tokenHash);

    if (!user) {
      this.logger.warn('resetPassword: invalid or expired reset OTP');
      throw new BadRequestException(AUTH_MESSAGES.ERROR.INVALID_TOKEN);
    }

    const passwordHash = await hashValue(dto.newPassword);

    await Promise.all([
      this.usersRepository.updateById(user._id, {
        passwordHash,
        passwordResetToken: undefined,
        passwordResetTokenExpiry: undefined,
      }),
      this.authRepository.revokeAllUserRefreshTokens(user._id),
    ]);

    return { message: AUTH_MESSAGES.SUCCESS.PASSWORD_RESET };
  }

  /** Onboarding step 1 — creates an unverified account and dispatches an email OTP. */
  async createAccount(dto: CreateAccountDto): Promise<ServiceResponse<null>> {
    const [existing, passwordHash] = await Promise.all([
      this.usersRepository.findByEmail(dto.email),
      hashValue(dto.password),
    ]);

    if (existing) {
      this.logger.warn(
        `createAccount: email already registered [email=${dto.email}]`,
      );
      throw new ConflictException(AUTH_MESSAGES.ERROR.EMAIL_TAKEN);
    }
    const otp = generateOtp();
    const otpHash = hashToken(otp);
    const expiry = new Date(Date.now() + CACHE_TTL.EMAIL_OTP * 1000);

    await this.usersRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      passwordHash,
      userRole: UserRole.OWNER,
      isActive: false,
      isEmailVerified: false,
      emailVerificationOtp: otpHash,
      emailVerificationOtpExpiry: expiry,
    });

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

    return { message: AUTH_MESSAGES.SUCCESS.ACCOUNT_CREATED };
  }

  /** Onboarding step 2 — validates the email OTP and marks the address as verified. */
  async verifyEmail(dto: VerifyEmailDto): Promise<ServiceResponse<null>> {
    const user = await this.usersRepository.findByEmail(dto.email);

    // Treat missing/already-verified the same as a bad code — prevents
    // callers from distinguishing registered vs unregistered emails
    if (!user || user.isEmailVerified) {
      this.logger.warn(
        `verifyEmail: ${!user ? 'user not found' : 'already verified'} [email=${dto.email}]`,
      );
      throw new BadRequestException(AUTH_MESSAGES.ERROR.INVALID_OTP);
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
      throw new BadRequestException(AUTH_MESSAGES.ERROR.INVALID_OTP);
    }

    await this.usersRepository.updateById(user._id, {
      isEmailVerified: true,
      emailVerificationOtp: undefined,
      emailVerificationOtpExpiry: undefined,
    });

    return { message: AUTH_MESSAGES.SUCCESS.EMAIL_VERIFIED };
  }

  /** Onboarding step 2b — generates a fresh OTP and resends the verification email. */
  async resendEmailOtp(dto: ResendOtpDto): Promise<ServiceResponse<null>> {
    const user = await this.usersRepository.findByEmail(dto.email);

    // Always return success — prevents callers from probing whether an email
    // is registered or already verified (OWASP enumeration prevention)
    if (!user || user.isEmailVerified) {
      return { message: AUTH_MESSAGES.SUCCESS.OTP_RESENT };
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

    return { message: AUTH_MESSAGES.SUCCESS.OTP_RESENT };
  }

  /** Onboarding step 3 — hashes and stores the user's 4-digit PIN. */
  async setPin(dto: SetPinDto): Promise<ServiceResponse<null>> {
    const user = await this.usersRepository.findByEmail(dto.email);
    if (!user) {
      this.logger.warn(`setPin: user not found [email=${dto.email}]`);
      throw new BadRequestException(AUTH_MESSAGES.ERROR.ACCOUNT_NOT_FOUND);
    }

    if (!user.isEmailVerified) {
      this.logger.warn(
        `setPin: email not verified [userId=${user._id.toString()}]`,
      );
      throw new BadRequestException(AUTH_MESSAGES.ERROR.EMAIL_NOT_VERIFIED);
    }

    const pinHash = await hashValue(dto.pin);
    await this.usersRepository.updateById(user._id, { pinHash });

    return { message: AUTH_MESSAGES.SUCCESS.PIN_SET };
  }

  /** Onboarding step 4 — creates the business, seeds defaults, activates the account, issues auth tokens, and triggers AI website generation. */
  async createBusiness(
    dto: CreateBusinessDto,
  ): Promise<ServiceResponse<LoginData>> {
    const user = await this.usersRepository.findByEmail(dto.email);
    if (!user) {
      this.logger.warn(`createBusiness: user not found [email=${dto.email}]`);
      throw new BadRequestException(AUTH_MESSAGES.ERROR.ACCOUNT_NOT_FOUND);
    }

    if (!user.isEmailVerified) {
      this.logger.warn(
        `createBusiness: email not verified [userId=${user._id.toString()}]`,
      );
      throw new BadRequestException(AUTH_MESSAGES.ERROR.EMAIL_NOT_VERIFIED);
    }

    if (!user.pinHash) {
      this.logger.warn(
        `createBusiness: PIN not set [userId=${user._id.toString()}]`,
      );
      throw new BadRequestException(AUTH_MESSAGES.ERROR.PIN_NOT_SET);
    }

    if (user.businessId) {
      this.logger.warn(
        `createBusiness: business already exists [userId=${user._id.toString()}]`,
      );
      throw new ConflictException(AUTH_MESSAGES.ERROR.BUSINESS_ALREADY_SETUP);
    }

    const base = this.generateSubdomain(dto.businessName);

    const [category, subdomain] = await Promise.all([
      this.businessCategoriesRepository.findById(dto.businessCategory),
      this.findAvailableSubdomain(base),
    ]);

    if (!category) {
      this.logger.warn(
        `createBusiness: invalid category [categoryId=${dto.businessCategory}]`,
      );
      throw new BadRequestException(
        BUSINESS_CATEGORIES_MESSAGES.ERROR.NOT_FOUND,
      );
    }

    const trialEndsAt = new Date();
    trialEndsAt.setMonth(trialEndsAt.getMonth() + 1);

    const { businessId } = await this.runBusinessOnboardingTransaction(
      dto,
      user._id,
      subdomain,
      category.name,
      trialEndsAt,
    );

    const { accessToken, refreshToken } = await this.issueSession(
      user._id,
      businessId,
      user.userRole,
    );

    const emailData = { to: user.email, firstName: user.firstName };
    await this.agendaService
      .now(JOBS.EMAIL_WELCOME, emailData)
      .catch((err: unknown) =>
        this.logger.error(
          `Email job "${JOBS.EMAIL_WELCOME}" failed: ${err instanceof Error ? err.stack : String(err)}`,
        ),
      );

    return {
      message: AUTH_MESSAGES.SUCCESS.BUSINESS_CREATED,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          businessId: businessId.toString(),
          subdomain,
        },
      },
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async runBusinessOnboardingTransaction(
    dto: CreateBusinessDto,
    ownerId: Types.ObjectId,
    subdomain: string,
    categoryName: string,
    trialEndsAt: Date,
  ): Promise<{ businessId: Types.ObjectId }> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const business = await this.businessRepository.create(
        {
          ownerId,
          name: dto.businessName,
          subdomain,
          categoryId: new Types.ObjectId(dto.businessCategory),
          categoryName,
          description: dto.businessDescription,
          colors: {
            primary: dto.colorPrimary ?? '#2563eb',
            secondary: dto.colorSecondary ?? '#64748b',
          },
          font: dto.font ?? 'Inter',
          services: dto.services ?? [],
          timezone: dto.timezone ?? 'UTC',
          subscription: {
            plan: SubscriptionPlan.STARTER,
            status: SubscriptionStatus.TRIALING,
            trialEndsAt,
            features: getFeaturesForPlan(SubscriptionPlan.STARTER),
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
          colorPrimary: dto.colorPrimary ?? '#2563eb',
          colorSecondary: dto.colorSecondary ?? '#64748b',
          font: dto.font ?? 'Inter',
        },
        session,
      );

      await this.usersRepository.updateById(
        ownerId,
        { businessId, roleId: ownerRoleId, isActive: true },
        session,
      );

      await session.commitTransaction();

      return { businessId };
    } catch (err) {
      await session.abortTransaction();
      this.logger.error(
        `Business onboarding transaction failed: ${err instanceof Error ? err.stack : String(err)}`,
      );
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
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signAccessToken({
      sub: userId.toString(),
      businessId: businessId.toString(),
      userRole,
      pinVerified: false,
    });

    const rawRefreshToken = generateSecureToken(32);
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await Promise.all([
      this.usersRepository.updateById(userId, { lastLoginAt: new Date() }),
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
    return this.jwtService.sign(payload);
  }
}
