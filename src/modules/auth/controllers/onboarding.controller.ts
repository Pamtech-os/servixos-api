import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';
import { AppEnvironment } from 'src/common/constants/app.constants';
import { AllowOnboarding } from 'src/common/decorators/allow-onboarding.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { CurrentChannel } from 'src/common/decorators/channel.decorator';
import { Channel } from 'src/common/enums/channel.enum';
import { SetPinDto } from '../dto/set-pin.dto';
import { CreateBusinessDto } from '../dto/create-business.dto';
import { setAuthCookies } from '../utils/auth-cookies.util';

/** Signed-in onboarding steps — reachable with an onboarding-scoped or full session. */
@AllowOnboarding()
@Controller('auth/onboarding')
export class OnboardingController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  async status(@CurrentUser() user: JwtUser) {
    const result = await this.authService.getOnboardingStatus(user.sub);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.ONBOARDING_STATUS, data: result };
  }

  @Post('set-pin')
  @HttpCode(HttpStatus.OK)
  async setPin(@CurrentUser() user: JwtUser, @Body() dto: SetPinDto) {
    const result = await this.authService.setPin(user.sub, dto);
    if (result instanceof HttpException) throw result;
    return { message: AUTH_MESSAGES.SUCCESS.PIN_SET, data: null };
  }

  @Post('business')
  @HttpCode(HttpStatus.CREATED)
  async createBusiness(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateBusinessDto,
    @CurrentChannel() channel: Channel,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.createBusiness(user.sub, dto);
    if (result instanceof HttpException) throw result;

    if (channel === Channel.WEB) {
      setAuthCookies(
        res,
        result.accessToken,
        result.refreshToken,
        this.config.get<string>('NODE_ENV') === AppEnvironment.PRODUCTION,
      );
    }

    return { message: AUTH_MESSAGES.SUCCESS.BUSINESS_CREATED, data: result };
  }
}
