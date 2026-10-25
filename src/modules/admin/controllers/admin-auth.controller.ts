import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { CHANNEL_MESSAGES } from 'src/common/constants/messages/channel.messages';
import {
  ACCESS_TOKEN_COOKIE_MAX_AGE,
  ADMIN_REFRESH_TOKEN_COOKIE_MAX_AGE,
  COOKIE_NAMES,
} from 'src/common/constants/cookie.constants';
import { AppEnvironment } from 'src/common/constants/app.constants';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AdminJwtPayload } from '../types/admin.types';

@Public()
@SkipSignature()
@Controller('admin/api/auth')
export class AdminAuthController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.adminAuthService.login(dto);
    if (result instanceof HttpException) throw result;

    if ('accessToken' in result) {
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
    }

    return { message: ADMIN_MESSAGES.SUCCESS.LOGIN, data: result };
  }

  /** Invited admin submits their OTP to complete login. */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.adminAuthService.verifyOtp(dto);
    if (result instanceof HttpException) throw result;

    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    return { message: ADMIN_MESSAGES.SUCCESS.LOGIN, data: result };
  }

  /** Authenticated admin changes their password (clears mustChangePassword flag). */
  @Post('change-password')
  @UseGuards(JwtAdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    const result = await this.adminAuthService.changePassword(admin.sub, dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.PASSWORD_CHANGED, data: result };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = req.cookies?.[COOKIE_NAMES.ADMIN_REFRESH_TOKEN] as
      | string
      | undefined;
    if (!cookieToken) {
      throw new UnauthorizedException(
        CHANNEL_MESSAGES.ERROR.WEB_REQUIRES_COOKIE,
      );
    }

    const result = await this.adminAuthService.refreshToken({
      refreshToken: cookieToken,
    });
    if (result instanceof HttpException) throw result;

    this.setAccessTokenCookie(res, result.accessToken);

    return { message: ADMIN_MESSAGES.SUCCESS.LOGIN, data: result };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieToken =
      (req.cookies?.[COOKIE_NAMES.ADMIN_REFRESH_TOKEN] as string | undefined) ??
      '';
    await this.adminAuthService.logout(cookieToken);
    this.clearAuthCookies(res);
    return { message: ADMIN_MESSAGES.SUCCESS.LOGOUT };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private get isProd(): boolean {
    return this.config.get<string>('NODE_ENV') === AppEnvironment.PRODUCTION;
  }

  private setAccessTokenCookie(res: Response, token: string): void {
    res.cookie(COOKIE_NAMES.ADMIN_ACCESS_TOKEN, token, {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
      path: '/',
    });
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    this.setAccessTokenCookie(res, accessToken);
    res.cookie(COOKIE_NAMES.ADMIN_REFRESH_TOKEN, refreshToken, {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      maxAge: ADMIN_REFRESH_TOKEN_COOKIE_MAX_AGE,
      path: '/',
    });
  }

  private clearAuthCookies(res: Response): void {
    const base = {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax' as const,
      path: '/',
    };
    res.clearCookie(COOKIE_NAMES.ADMIN_ACCESS_TOKEN, base);
    res.clearCookie(COOKIE_NAMES.ADMIN_REFRESH_TOKEN, base);
  }
}
