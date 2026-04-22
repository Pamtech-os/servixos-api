import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { BUSINESS_CATEGORIES_MESSAGES } from 'src/common/constants/messages/business-categories.messages';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { JwtUser } from 'src/common/decorators/current-user.decorator';
import { ApiResponse } from 'src/common/dto/response.dto';
import {
  compareValue,
  generateSecureToken,
  hashToken,
  hashValue,
} from 'src/common/utils/hash.util';
import { AuthRepository } from './auth.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UsersRepository } from '../users/users.repository';
import { BusinessRepository } from '../business/business.repository';
import { RolesRepository } from '../roles/roles.repository';
import { WebsiteConfigRepository } from '../website/website-config.repository';
import { BusinessCategoriesRepository } from '../business-categories/business-categories.repository';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import { UserRole } from '../users/schemas/user.schema';

const PIN_MAX_ATTEMPTS = 5;
const REFRESH_TOKEN_TTL_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly jwtService: JwtService,
    private readonly authRepository: AuthRepository,
    private readonly usersRepository: UsersRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly websiteConfigRepository: WebsiteConfigRepository,
    private readonly businessCategoriesRepository: BusinessCategoriesRepository,
    private readonly emailService: EmailService,
    private readonly redisService: RedisService,
  ) {}

  async register(dto: RegisterDto): Promise<ApiResponse<null>> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(AUTH_MESSAGES.ERROR.EMAIL_TAKEN);
    }

    const category = await this.businessCategoriesRepository.findById(
      dto.businessCategory,
    );
    if (!category) {
      throw new BadRequestException(
        BUSINESS_CATEGORIES_MESSAGES.ERROR.NOT_FOUND,
      );
    }

    const [passwordHash, pinHash] = await Promise.all([
      hashValue(dto.password),
      hashValue(dto.pin),
    ]);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 1. Create the owner user first — businessId and roleId are linked back later
      const user = await this.usersRepository.create(
        {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          pinHash,
          userRole: UserRole.OWNER,
          isActive: true,
        },
        session,
      );

      const userId = (user as unknown as { _id: Types.ObjectId })._id;

      // 2. Create the business
      const trialEndsAt = new Date();
      trialEndsAt.setMonth(trialEndsAt.getMonth() + 1);

      const business = await this.businessRepository.create(
        {
          ownerId: userId,
          name: dto.businessName,
          categoryId: new Types.ObjectId(dto.businessCategory),
          categoryName: category.name,
          description: dto.businessDescription,
          colors: {
            primary: dto.colorPrimary ?? '#2563eb',
            secondary: dto.colorSecondary ?? '#64748b',
          },
          font: dto.font ?? 'Inter',
          services: dto.services ?? [],
          timezone: dto.timezone ?? 'UTC',
          trialEndsAt,
        },
        session,
      );

      const businessId = (business as unknown as { _id: Types.ObjectId })._id;

      // 3. Create default roles and seed website config in parallel
      const [roles] = await Promise.all([
        this.rolesRepository.createDefaultRoles(businessId, session),
        this.websiteConfigRepository.create(
          {
            businessId,
            colorPrimary: dto.colorPrimary ?? '#2563eb',
            colorSecondary: dto.colorSecondary ?? '#64748b',
            font: dto.font ?? 'Inter',
          },
          session,
        ),
      ]);

      const ownerRoleId = (roles.owner as unknown as { _id: Types.ObjectId })
        ._id;

      // 4. Link user to business and owner role
      await this.usersRepository.updateById(
        userId,
        { businessId, roleId: ownerRoleId },
        session,
      );

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }

    return {
      success: true,
      statusCode: 201,
      message: AUTH_MESSAGES.SUCCESS.REGISTER,
    };
  }

  async login(dto: LoginDto): Promise<
    ApiResponse<{
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        businessId: string;
      };
    }>
  > {
    const user = await this.usersRepository.findByEmail(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    const passwordValid = await compareValue(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    const userId = (user as unknown as { _id: Types.ObjectId })._id;
    const businessId = user.businessId!;

    await this.usersRepository.updateById(userId, { lastLoginAt: new Date() });

    const accessToken = this.signAccessToken({
      sub: userId.toString(),
      businessId: businessId.toString(),
      userRole: user.userRole,
      pinVerified: false,
    });

    const rawRefreshToken = generateSecureToken(32);
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.authRepository.createRefreshToken({
      userId,
      businessId: businessId,
      tokenHash,
      expiresAt,
    });

    return {
      success: true,
      statusCode: 200,
      message: AUTH_MESSAGES.SUCCESS.LOGIN,
      data: {
        accessToken,
        refreshToken: rawRefreshToken,
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

  async verifyPin(
    authorization: string | undefined,
    pin: string,
  ): Promise<ApiResponse<{ accessToken: string }>> {
    const token = authorization?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.UNAUTHORIZED);
    }

    let payload: JwtUser;
    try {
      payload = this.jwtService.verify<JwtUser>(token);
    } catch {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.EXPIRED_TOKEN);
    }

    const attemptsKey = `pin_attempts:${payload.sub}`;
    const attempts = parseInt(
      (await this.redisService.get(attemptsKey)) ?? '0',
      10,
    );

    if (attempts >= PIN_MAX_ATTEMPTS) {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.PIN_LOCKED);
    }

    const user = await this.usersRepository.findById(payload.sub);
    if (!user || !user.isActive) {
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
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.INVALID_PIN);
    }

    // Clear failed attempts on success
    await this.redisService.del(attemptsKey);

    const accessToken = this.signAccessToken({
      sub: payload.sub,
      businessId: payload.businessId,
      userRole: payload.userRole,
      pinVerified: true,
    });

    return {
      success: true,
      statusCode: 200,
      message: AUTH_MESSAGES.SUCCESS.PIN_VERIFIED,
      data: { accessToken },
    };
  }

  async refreshToken(
    dto: RefreshTokenDto,
  ): Promise<ApiResponse<{ accessToken: string }>> {
    const tokenHash = hashToken(dto.refreshToken);
    const stored = await this.authRepository.findValidRefreshToken(tokenHash);

    if (!stored) {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.EXPIRED_TOKEN);
    }

    const user = await this.usersRepository.findById(stored.userId.toString());
    if (!user || !user.isActive) {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    const accessToken = this.signAccessToken({
      sub: stored.userId.toString(),
      businessId: stored.businessId.toString(),
      userRole: user.userRole,
      pinVerified: false,
    });

    return {
      success: true,
      statusCode: 200,
      message: AUTH_MESSAGES.SUCCESS.TOKEN_REFRESHED,
      data: { accessToken },
    };
  }

  async logout(refreshToken: string): Promise<ApiResponse<null>> {
    if (!refreshToken) {
      throw new BadRequestException(AUTH_MESSAGES.ERROR.INVALID_TOKEN);
    }

    const tokenHash = hashToken(refreshToken);
    await this.authRepository.revokeRefreshToken(tokenHash);

    return {
      success: true,
      statusCode: 200,
      message: AUTH_MESSAGES.SUCCESS.LOGOUT,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<ApiResponse<null>> {
    const user = await this.usersRepository.findByEmail(dto.email);

    if (user) {
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const expiry = new Date(
        Date.now() + CACHE_TTL.PASSWORD_RESET_TOKEN * 1000,
      );
      const userId = (user as unknown as { _id: Types.ObjectId })._id;

      await this.usersRepository.updateById(userId, {
        passwordResetToken: tokenHash,
        passwordResetTokenExpiry: expiry,
      });

      // Fire-and-forget — never block the response on email delivery
      void this.emailService.sendPasswordResetEmail(
        user.email,
        user.firstName,
        rawToken,
      );
    }

    // Always return 200 to prevent email enumeration
    return {
      success: true,
      statusCode: 200,
      message: AUTH_MESSAGES.SUCCESS.PASSWORD_RESET_SENT,
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<ApiResponse<null>> {
    const tokenHash = hashToken(dto.token);
    const user = await this.usersRepository.findByPasswordResetToken(tokenHash);

    if (!user) {
      throw new BadRequestException(AUTH_MESSAGES.ERROR.INVALID_TOKEN);
    }

    const userId = (user as unknown as { _id: Types.ObjectId })._id;
    const passwordHash = await hashValue(dto.newPassword);

    await this.usersRepository.updateById(userId, {
      passwordHash,
      passwordResetToken: undefined,
      passwordResetTokenExpiry: undefined,
    });

    // Revoke all sessions after password reset for security
    await this.authRepository.revokeAllUserRefreshTokens(userId);

    return {
      success: true,
      statusCode: 200,
      message: AUTH_MESSAGES.SUCCESS.PASSWORD_RESET,
    };
  }

  private signAccessToken(payload: JwtUser): string {
    return this.jwtService.sign(payload);
  }
}
