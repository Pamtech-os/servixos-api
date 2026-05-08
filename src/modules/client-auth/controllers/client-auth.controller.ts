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
} from '@nestjs/common';
import { CLIENT_AUTH_MESSAGES } from 'src/common/constants/messages/client-auth.messages';
import { Public } from 'src/common/decorators/public.decorator';
import { ClientForgotPasswordDto } from '../dto/client-forgot-password.dto';
import { ClientLoginDto } from '../dto/client-login.dto';
import { ClientRefreshTokenDto } from '../dto/client-refresh-token.dto';
import { ClientResetPasswordDto } from '../dto/client-reset-password.dto';
import { ClientAuthService } from '../services/client-auth.service';

@Public()
@Controller('client-auth')
export class ClientAuthController {
  constructor(private readonly clientAuthService: ClientAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: ClientLoginDto,
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

    return {
      message: CLIENT_AUTH_MESSAGES.SUCCESS.LOGIN,
      data: result,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: ClientRefreshTokenDto) {
    const result = await this.clientAuthService.refreshToken(dto);
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_AUTH_MESSAGES.SUCCESS.TOKEN_REFRESHED,
      data: result,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: ClientRefreshTokenDto) {
    const result = await this.clientAuthService.logout(dto);
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_AUTH_MESSAGES.SUCCESS.LOGOUT,
      data: null,
    };
  }

  @Post('forgot-password')
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
  async me(@Headers('authorization') authorization: string | undefined) {
    const result = await this.clientAuthService.getProfile(authorization);
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_AUTH_MESSAGES.SUCCESS.PROFILE_RETRIEVED,
      data: result,
    };
  }
}
