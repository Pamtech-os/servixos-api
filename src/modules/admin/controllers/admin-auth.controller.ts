import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { AdminRefreshTokenDto } from '../dto/admin-refresh-token.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AdminJwtPayload } from '../types/admin.types';

@Public()
@SkipSignature()
@Controller('admin/api/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: AdminLoginDto) {
    const result = await this.adminAuthService.login(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.LOGIN, data: result };
  }

  /** Invited admin submits their OTP to complete login. */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    const result = await this.adminAuthService.verifyOtp(dto);
    if (result instanceof HttpException) throw result;
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
  async refresh(@Body() dto: AdminRefreshTokenDto) {
    const result = await this.adminAuthService.refreshToken(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.LOGIN, data: result };
  }

  @Post('logout')
  @UseGuards(JwtAdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: AdminRefreshTokenDto) {
    await this.adminAuthService.logout(dto.refreshToken);
    return { message: ADMIN_MESSAGES.SUCCESS.LOGOUT };
  }
}
