import {
  Controller,
  Get,
  HttpException,
  Logger,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { pipeline } from 'stream/promises';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { formatErrorMessage } from 'src/common/utils/error.util';
import { WAITLIST_MESSAGES } from 'src/common/constants/messages/waitlist.messages';
import { JwtAdminAuthGuard } from 'src/modules/admin/guards/jwt-admin-auth.guard';
import { WaitlistService } from '../services/waitlist.service';
import { ExportWaitlistDto, QueryWaitlistDto } from '../dto/query-waitlist.dto';

@Public()
@SkipSignature()
@UseGuards(JwtAdminAuthGuard)
@Controller('admin/api/waitlist')
export class AdminWaitlistController {
  private readonly logger = new Logger(AdminWaitlistController.name);

  constructor(private readonly waitlistService: WaitlistService) {}

  @Get()
  async list(@Query() dto: QueryWaitlistDto) {
    const result = await this.waitlistService.list(dto);
    if (result instanceof HttpException) throw result;
    return { message: WAITLIST_MESSAGES.SUCCESS.RETRIEVED, data: result };
  }

  // Streams the CSV directly to bypass ResponseTransformInterceptor's JSON envelope
  @Get('export')
  async export(@Query() dto: ExportWaitlistDto, @Res() res: Response) {
    const result = await this.waitlistService.exportCsv(dto);
    if (result instanceof HttpException) throw result;
    res.status(200).set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
    });
    // pipeline propagates backpressure and destroys both ends if either side errors or disconnects
    await pipeline(result.stream, res).catch((err: unknown) =>
      this.logger.warn(`export stream aborted: ${formatErrorMessage(err)}`),
    );
  }
}
