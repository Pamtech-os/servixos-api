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
import { CLIENT_AUTH_MESSAGES } from 'src/common/constants/messages/client-auth.messages';
import { CHANNEL_MESSAGES } from 'src/common/constants/messages/channel.messages';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentChannel } from 'src/common/decorators/channel.decorator';
import { Channel } from 'src/common/enums/channel.enum';
import { Throttle } from '@nestjs/throttler';
import { ClientForgotPasswordDto } from '../dto/client-forgot-password.dto';
import { ClientLoginDto } from '../dto/client-login.dto';
import { ClientRefreshTokenDto } from '../dto/client-refresh-token.dto';
import { ClientResetPasswordDto } from '../dto/client-reset-password.dto';
import { ClientAuthService } from '../services/client-auth.service';
import { AppEnvironment } from 'src/common/constants/app.constants';
import {
  ACCESS_TOKEN_COOKIE_MAX_AGE,
  COOKIE_NAMES,
  REFRESH_TOKEN_COOKIE_MAX_AGE,
} from 'src/common/constants/cookie.constants';

@Public()
@Controller('client-auth')
export class ClientAuthController {
  constructor(
    private readonly clientAuthService: ClientAuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @Throttle({ global: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: ClientLoginDto,
    @CurrentChannel() channel: Channel,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ) {
    const ipAddress = forwardedFor?.split(',')[0].trim() ?? ip;
    const result = await this.clientAuthService.login(
      dto,
      ipAddress,
      userAgent,
    );
    if (result instanceof HttpException) throw result;

    if (channel === Channel.WEB) {
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
    }

    return {
      message: CLIENT_AUTH_MESSAGES.SUCCESS.LOGIN,
      data: result,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: ClientRefreshTokenDto,
    @CurrentChannel() channel: Channel,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let resolvedToken: string;

    if (channel === Channel.WEB) {
      const cookieToken = req.cookies?.[COOKIE_NAMES.CLIENT_REFRESH_TOKEN] as
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

    const result = await this.clientAuthService.refreshToken({
      refreshToken: resolvedToken,
    });
    if (result instanceof HttpException) throw result;

    if (channel === Channel.WEB) {
      this.setAuthCookies(res, result.accessToken, result.refreshToken!);
    }

    return {
      message: CLIENT_AUTH_MESSAGES.SUCCESS.TOKEN_REFRESHED,
      data: result,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: ClientRefreshTokenDto,
    @CurrentChannel() channel: Channel,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let resolvedToken: string;

    if (channel === Channel.WEB) {
      resolvedToken =
        (req.cookies?.[COOKIE_NAMES.CLIENT_REFRESH_TOKEN] as
          | string
          | undefined) ?? '';
    } else {
      resolvedToken = dto.refreshToken ?? '';
    }

    const result = await this.clientAuthService.logout({
      refreshToken: resolvedToken,
    });
    if (result instanceof HttpException) throw result;

    if (channel === Channel.WEB) {
      this.clearAuthCookies(res);
    }

    return {
      message: CLIENT_AUTH_MESSAGES.SUCCESS.LOGOUT,
      data: null,
    };
  }

  @Post('forgot-password')
  @Throttle({ global: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ClientForgotPasswordDto) {
    const result = await this.clientAuthService.forgotPassword(dto);
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_AUTH_MESSAGES.SUCCESS.PASSWORD_RESET_SENT,
      data: null,
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ClientResetPasswordDto) {
    const result = await this.clientAuthService.resetPassword(dto);
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_AUTH_MESSAGES.SUCCESS.PASSWORD_RESET,
      data: null,
    };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async me(
    @CurrentChannel() channel: Channel,
    @Req() req: Request,
    @Headers('authorization') authorization?: string,
  ) {
    // web: read from httpOnly cookie; mobile: read from Authorization header
    let resolvedAuthorization: string | undefined;
    if (channel === Channel.WEB) {
      const cookieToken = req.cookies?.[COOKIE_NAMES.CLIENT_ACCESS_TOKEN] as
        | string
        | undefined;
      resolvedAuthorization = cookieToken ? `Bearer ${cookieToken}` : undefined;
    } else {
      resolvedAuthorization = authorization;
    }

    const result = await this.clientAuthService.getProfile(
      resolvedAuthorization,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_AUTH_MESSAGES.SUCCESS.PROFILE_RETRIEVED,
      data: result,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private get isProd(): boolean {
    return this.config.get<string>('NODE_ENV') === AppEnvironment.PRODUCTION;
  }

  private setAccessTokenCookie(res: Response, token: string): void {
    res.cookie(COOKIE_NAMES.CLIENT_ACCESS_TOKEN, token, {
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
    res.cookie(COOKIE_NAMES.CLIENT_REFRESH_TOKEN, refreshToken, {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
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
    res.clearCookie(COOKIE_NAMES.CLIENT_ACCESS_TOKEN, base);
    res.clearCookie(COOKIE_NAMES.CLIENT_REFRESH_TOKEN, base);
  }
}
