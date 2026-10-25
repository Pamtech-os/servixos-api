import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ACTIVITY_LOGS_MESSAGES } from 'src/common/constants/messages/activity-logs.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { ActivityLogsService } from '../services/activity-logs.service';
import { QueryActivityLogsDto } from '../dto/query-activity-logs.dto';

@Controller('activity-logs')
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listLogs(
    @CurrentUser() user: JwtUser,
    @Query() query: QueryActivityLogsDto,
  ) {
    const result = await this.activityLogsService.listLogs(
      user.businessId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: ACTIVITY_LOGS_MESSAGES.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
    };
  }
}
