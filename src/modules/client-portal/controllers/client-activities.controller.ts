import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentClient } from '../decorators/current-client.decorator';
import { ListClientActivitiesDto } from '../dto/list-client-activities.dto';
import { ClientHttpAuthGuard } from '../guards/client-http-auth.guard';
import type { ClientRequestUser } from '../interfaces/client-request.interface';
import { ClientActivitiesService } from '../services/client-activities.service';

@Public()
@UseGuards(ClientHttpAuthGuard)
@Controller('client/api/activities')
export class ClientActivitiesController {
  constructor(private readonly activitiesService: ClientActivitiesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listActivities(
    @CurrentClient() client: ClientRequestUser,
    @Query() query: ListClientActivitiesDto,
  ) {
    const result = await this.activitiesService.listActivities(
      client.businessId,
      client.clientId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.ACTIVITY.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
      timestamp: new Date().toISOString(),
    };
  }
}
