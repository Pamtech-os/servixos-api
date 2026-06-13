import {
  Controller,
  Get,
  HttpException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { AdminActivityLogsService } from '../services/admin-activity-logs.service';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { QueryActivityLogsDto } from '../dto/query-activity-logs.dto';

@Public()
@SkipSignature()
@UseGuards(JwtAdminAuthGuard)
@Controller('admin/api/activity-logs')
export class AdminActivityLogsController {
  constructor(
    private readonly adminActivityLogsService: AdminActivityLogsService,
  ) {}

  @Get()
  async getActivityLogs(@Query() dto: QueryActivityLogsDto) {
    const result = await this.adminActivityLogsService.getActivityLogs(dto);
    if (result instanceof HttpException) throw result;
    return {
      message: ADMIN_MESSAGES.SUCCESS.ACTIVITY_LOGS_RETRIEVED,
      data: result,
    };
  }
}
