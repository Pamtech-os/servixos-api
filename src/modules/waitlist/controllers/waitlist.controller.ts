import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { SkipChannel } from 'src/common/decorators/channel.decorator';
import { WAITLIST_MESSAGES } from 'src/common/constants/messages/waitlist.messages';
import { WaitlistService } from '../services/waitlist.service';
import { JoinWaitlistDto } from '../dto/join-waitlist.dto';
import { UnsubscribeWaitlistDto } from '../dto/unsubscribe-waitlist.dto';

// Fully public so the marketing site can post without HMAC signing or X-Channel; rate limiting is the abuse guard
@Public()
@SkipSignature()
@SkipChannel()
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ global: { ttl: 60_000, limit: 5 } })
  async join(@Body() dto: JoinWaitlistDto) {
    const result = await this.waitlistService.join(dto);
    if (result instanceof HttpException) throw result;
    return { message: WAITLIST_MESSAGES.SUCCESS.JOINED, data: result };
  }

  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ global: { ttl: 60_000, limit: 5 } })
  async unsubscribe(@Body() dto: UnsubscribeWaitlistDto) {
    const result = await this.waitlistService.unsubscribe(dto.token);
    if (result instanceof HttpException) throw result;
    return { message: WAITLIST_MESSAGES.SUCCESS.UNSUBSCRIBED };
  }
}
