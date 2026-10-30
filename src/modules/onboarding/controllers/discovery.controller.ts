import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AllowOnboarding } from 'src/common/decorators/allow-onboarding.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { ONBOARDING_MESSAGES } from 'src/common/constants/messages/onboarding.messages';
import { OnboardingService } from '../services/onboarding.service';
import { DiscoveryAgentService } from '../services/discovery-agent.service';
import { ChatMessageDto } from '../dto/chat-message.dto';
import { ApproveSetupDto } from '../dto/approve-setup.dto';
import { WebsitePreviewDto } from '../dto/website-preview.dto';
import { OnboardingSetupService } from '../services/onboarding-setup.service';
import { setAuthCookies } from '../../auth/utils/auth-cookies.util';
import { AppEnvironment } from 'src/common/constants/app.constants';
import { CurrentChannel } from 'src/common/decorators/channel.decorator';
import { Channel } from 'src/common/enums/channel.enum';
import { ConfigService } from '@nestjs/config';
import type { DiscoveryEvent } from '../types/onboarding.types';

/** Phase 2 — AI business discovery workspace (chat + structured profile). */
@AllowOnboarding()
@Controller('onboarding')
export class DiscoveryController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly discoveryAgent: DiscoveryAgentService,
    private readonly setupService: OnboardingSetupService,
    private readonly config: ConfigService,
  ) {}

  @Get('session')
  async getSession(@CurrentUser() user: JwtUser) {
    const result = await this.onboardingService.getSession(user.sub);
    if (result instanceof HttpException) throw result;
    return {
      message: ONBOARDING_MESSAGES.SUCCESS.SESSION_RETRIEVED,
      data: result,
    };
  }

  /**
   * Streams the assistant's reply as Server-Sent Events:
   * `text` (delta), `section` (profile update), `starting_point`, `done`, `error`.
   */
  @Post('chat')
  @Throttle({ global: { ttl: 60_000, limit: 20 } })
  async chat(
    @CurrentUser() jwtUser: JwtUser,
    @Body() dto: ChatMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    const user = await this.onboardingService.getEligibleUser(jwtUser.sub);
    if (user instanceof HttpException) throw user;

    if (!(await this.discoveryAgent.acquireChatLock(jwtUser.sub))) {
      throw new ConflictException(ONBOARDING_MESSAGES.ERROR.CHAT_IN_PROGRESS);
    }

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream');
    // no-transform stops the compression middleware from buffering the stream
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Listen on res: req emits 'close' as soon as the body is read on modern Node
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    const emit = (event: DiscoveryEvent) => {
      if (res.writableEnded) return;
      const { type, ...data } = event;
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    await this.discoveryAgent.chat(user, dto.message, emit, abort.signal);
    res.end();
  }

  @Patch('profile/:section')
  async updateSection(
    @CurrentUser() user: JwtUser,
    @Param('section') section: string,
    // Validated per section inside the service against that section's DTO
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.onboardingService.updateSection(
      user.sub,
      section,
      body,
    );
    if (result instanceof HttpException) throw result;
    return {
      message: ONBOARDING_MESSAGES.SUCCESS.SECTION_UPDATED,
      data: result,
    };
  }

  @Post('profile/:section/approve')
  @HttpCode(HttpStatus.OK)
  async approveSection(
    @CurrentUser() user: JwtUser,
    @Param('section') section: string,
  ) {
    const result = await this.onboardingService.approveSection(
      user.sub,
      section,
    );
    if (result instanceof HttpException) throw result;
    return {
      message: ONBOARDING_MESSAGES.SUCCESS.SECTION_APPROVED,
      data: result,
    };
  }

  @Get('preview/website')
  async getWebsitePreview(@CurrentUser() user: JwtUser) {
    const result = await this.setupService.getWebsitePreview(user.sub);
    if (result instanceof HttpException) throw result;
    return {
      message: ONBOARDING_MESSAGES.SUCCESS.PREVIEW_RETRIEVED,
      data: result,
    };
  }

  @Post('preview/website')
  @HttpCode(HttpStatus.OK)
  @Throttle({ global: { ttl: 60_000, limit: 5 } })
  async generateWebsitePreview(
    @CurrentUser() user: JwtUser,
    @Body() dto: WebsitePreviewDto,
  ) {
    const result = await this.setupService.generateWebsitePreview(
      user.sub,
      dto.instructions,
    );
    if (result instanceof HttpException) throw result;
    return {
      message: ONBOARDING_MESSAGES.SUCCESS.PREVIEW_GENERATED,
      data: result,
    };
  }

  /** Creates the business from the approved profile and returns a full-scope session. */
  @Post('approve')
  @HttpCode(HttpStatus.CREATED)
  async approveSetup(
    @CurrentUser() user: JwtUser,
    @Body() dto: ApproveSetupDto,
    @CurrentChannel() channel: Channel,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.setupService.approveSetup(user.sub, dto);
    if (result instanceof HttpException) throw result;

    if (channel === Channel.WEB) {
      setAuthCookies(
        res,
        result.accessToken,
        result.refreshToken,
        this.config.get<string>('NODE_ENV') === AppEnvironment.PRODUCTION,
      );
    }

    return {
      message: ONBOARDING_MESSAGES.SUCCESS.SETUP_APPROVED,
      data: result,
    };
  }
}
