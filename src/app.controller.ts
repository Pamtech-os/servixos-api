import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { SkipSignature } from './common/decorators/skip-signature.decorator';
import { SkipChannel } from './common/decorators/channel.decorator';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @SkipChannel()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Public()
  @SkipSignature()
  @SkipChannel()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
