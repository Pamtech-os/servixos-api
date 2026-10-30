import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { CHANNEL_MESSAGES } from 'src/common/constants/messages/channel.messages';
import { API_KEY_MESSAGES } from 'src/common/constants/messages/api-key.messages';
import { LoginDto } from '../dto/login.dto';
import { VerifyPinDto } from '../dto/verify-pin.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { CreateAccountDto } from '../dto/create-account.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ResendOtpDto } from '../dto/resend-otp.dto';
import { CompleteSetupDto } from '../dto/complete-setup.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import {
  CurrentChannel,
  SkipChannel,
} from 'src/common/decorators/channel.decorator';
import { Channel } from 'src/common/enums/channel.enum';
import { Throttle } from '@nestjs/throttler';
import { AppEnvironment } from 'src/common/constants/app.constants';
import { COOKIE_NAMES } from 'src/common/constants/cookie.constants';
import {
  clearAuthCookies,
  setAccessTokenCookie,
  setAuthCookies,
} from '../utils/auth-cookies.util';
// import { Encrypt } from 'src/common/decorators/encrypt.decorator';

// @Encrypt()
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('client-token')
  @SkipSignature()
  @SkipChannel()
  @HttpCode(HttpStatus.OK)
  async clientToken() {
    const result = await this.authService.issueClientToken();
    return {
      message: API_KEY_MESSAGES.SUCCESS.CLIENT_TOKEN_ISSUED,
      data: result,
    };
  }

  @Post('login')
  @Throttle({ global: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @CurrentChannel() channel: Channel,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ) {
    const ipAddress = forwardedFor?.split(',')[0].trim() ?? ip;
    const result = await this.authService.login(dto, ipAddress, userAgent);
    if (result instanceof HttpException) throw result;

    if (channel === Channel.WEB) {
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
    }

    return { message: AUTH_MESSAGES.SUCCESS.LOGIN, data: result };
  }

  @Post('verify-pin')
  @HttpCode(HttpStatus.OK)
  async verifyPin(
    @Body() dto: VerifyPinDto,
    @CurrentChannel() channel: Channel,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('authorization') authorization?: string,
  ) {
    let resolvedAuthorization: string | undefined;

    if (channel === Channel.WEB) {
      const cookieToken = req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN] as
        | string
        | undefined;
      if (!cookieToken) {
        throw new UnauthorizedException(
          CHANNEL_MESSAGES.ERROR.WEB_REQUIRES_ACCESS_COOKIE,
        );
      }
      resolvedAuthorization = `Bearer ${cookieToken}`;
    } else {
      resolvedAuthorization = authorization;
    }

    const result = await this.authService.verifyPin(
      resolvedAuthorization,
      dto.pin,
    );
    if (result instanceof HttpException) throw result;

    if (channel === Channel.WEB) {
      this.setAccessTokenCookie(res, result.accessToken);
    }

    return { message: AUTH_MESSAGES.SUCCESS.PIN_VERIFIED, data: result };
  }

  @Post('complete-setup')
  @HttpCode(HttpStatus.OK)
  async completeSetup(
    @Body() dto: CompleteSetupDto,
    @CurrentChannel() channel: Channel,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('authorization') authorization?: string,
  ) {
    let resolvedAuthorization: string | undefined;

    if (channel === Channel.WEB) {
      const cookieToken = req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN] as
        | string
        | undefined;
      if (!cookieToken) {
        throw new UnauthorizedException(
          CHANNEL_MESSAGES.ERROR.WEB_REQUIRES_ACCESS_COOKIE,
        );
      }
      resolvedAuthorization = `Bearer ${cookieToken}`;
    } else {
      resolvedAuthorization = authorization;
    }

    const result = await this.authService.completeSetup(
      resolvedAuthorization,
      dto,
    );
    if (result instanceof HttpException) throw result;

    if (channel === Channel.WEB) {
      this.setAccessTokenCookie(res, result.accessToken);
    }

    return { message: AUTH_MESSAGES.SUCCESS.SETUP_COMPLETED, data: result };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @CurrentChannel() channel: Channel,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let resolvedToken: string;

    if (channel === Channel.WEB) {
      const cookieToken = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN] as
        | string
        | undefined;
      if (!cookieToken) {
        throw new UnauthorizedException(
          CHANNEL_MESSAGES.ERROR.WEB_REQUIRES_COOKIE,
        );
      }
      resolvedToken = cookieToken;
    } else {
      if (!dto.refreshToken) {
        throw new UnauthorizedException(
          CHANNEL_MESSAGES.ERROR.MOBILE_REQUIRES_BODY,
        );
      }
      resolvedToken = dto.refreshToken;
    }

    const result = await this.authService.refreshToken({
      refreshToken: resolvedToken,
    });
    if (result instanceof HttpException) throw result;

    if (channel === Channel.WEB) {
      this.setAuthCookies(res, result.accessToken, result.refreshToken!);
    }

    return { message: AUTH_MESSAGES.SUCCESS.TOKEN_REFRESHED, data: result };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: RefreshTokenDto,
    @CurrentChannel() channel: Channel,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let resolvedToken: string;

    if (channel === Channel.WEB) {
      resolvedToken =
        (req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN] as string | undefined) ?? '';
    } else {
      resolvedToken = dto.refreshToken ?? '';
    }

    const result = await this.authService.logout(resolvedToken);
    if (result instanceof HttpException) throw result;

    if (channel === Channel.WEB) {
      this.clearAuthCookies(res);
    }

    return { message: AUTH_MESSAGES.SUCCESS.LOGOUT, data: null };
  }

  @Post('forgot-password')
  @Throttle({ global: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return { message: AUTH_MESSAGES.SUCCESS.PASSWORD_RESET_SENT, data: null };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(dto);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.PASSWORD_RESET, data: null };
  }

  @Post('onboarding/account')
  @Throttle({ global: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.CREATED)
  async createAccount(@Body() dto: CreateAccountDto) {
    const result = await this.authService.createAccount(dto);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.ACCOUNT_CREATED, data: null };
  }

  @Post('onboarding/verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @CurrentChannel() channel: Channel,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyEmail(dto);
    if (result instanceof HttpException) throw result;

    if (channel === Channel.WEB) {
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
    }

    return { message: AUTH_MESSAGES.SUCCESS.EMAIL_VERIFIED, data: result };
  }

  @Post('onboarding/resend-otp')
  @Throttle({ global: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() dto: ResendOtpDto) {
    await this.authService.resendEmailOtp(dto);
    return { message: AUTH_MESSAGES.SUCCESS.OTP_RESENT, data: null };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private get isProd(): boolean {
    return this.config.get<string>('NODE_ENV') === AppEnvironment.PRODUCTION;
  }

  private setAccessTokenCookie(res: Response, token: string): void {
    setAccessTokenCookie(res, token, this.isProd);
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    setAuthCookies(res, accessToken, refreshToken, this.isProd);
  }

  private clearAuthCookies(res: Response): void {
    clearAuthCookies(res, this.isProd);
  }
}
