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
import { AuthService } from '../services/auth.service';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { API_KEY_MESSAGES } from 'src/common/constants/messages/api-key.messages';
import { LoginDto } from '../dto/login.dto';
import { VerifyPinDto } from '../dto/verify-pin.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { CreateAccountDto } from '../dto/create-account.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ResendOtpDto } from '../dto/resend-otp.dto';
import { SetPinDto } from '../dto/set-pin.dto';
import { CreateBusinessDto } from '../dto/create-business.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
// import { Encrypt } from 'src/common/decorators/encrypt.decorator';

// @Encrypt()
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('client-token')
  @SkipSignature()
  @HttpCode(HttpStatus.OK)
  async clientToken() {
    const result = await this.authService.issueClientToken();
    return {
      message: API_KEY_MESSAGES.SUCCESS.CLIENT_TOKEN_ISSUED,
      data: result,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ) {
    const ipAddress = forwardedFor?.split(',')[0].trim() ?? ip;
    const result = await this.authService.login(dto, ipAddress, userAgent);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.LOGIN, data: result };
  }

  @Post('verify-pin')
  @HttpCode(HttpStatus.OK)
  async verifyPin(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: VerifyPinDto,
  ) {
    const result = await this.authService.verifyPin(authorization, dto.pin);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.PIN_VERIFIED, data: result };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refreshToken(dto);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.TOKEN_REFRESHED, data: result };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.logout(dto.refreshToken);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.LOGOUT, data: null };
  }

  @Post('forgot-password')
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
  @HttpCode(HttpStatus.CREATED)
  async createAccount(@Body() dto: CreateAccountDto) {
    const result = await this.authService.createAccount(dto);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.ACCOUNT_CREATED, data: null };
  }

  @Post('onboarding/verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const result = await this.authService.verifyEmail(dto);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.EMAIL_VERIFIED, data: null };
  }

  @Post('onboarding/resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() dto: ResendOtpDto) {
    await this.authService.resendEmailOtp(dto);
    return { message: AUTH_MESSAGES.SUCCESS.OTP_RESENT, data: null };
  }

  @Post('onboarding/set-pin')
  @HttpCode(HttpStatus.OK)
  async setPin(@Body() dto: SetPinDto) {
    const result = await this.authService.setPin(dto);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.PIN_SET, data: null };
  }

  @Post('onboarding/business')
  @HttpCode(HttpStatus.CREATED)
  async createBusiness(@Body() dto: CreateBusinessDto) {
    const result = await this.authService.createBusiness(dto);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.BUSINESS_CREATED, data: result };
  }
}
