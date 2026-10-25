import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentClient } from '../decorators/current-client.decorator';
import { IdParamDto } from '../dto/id-param.dto';
import { ListClientJobsDto } from '../dto/list-client-jobs.dto';
import { ClientHttpAuthGuard } from '../guards/client-http-auth.guard';
import type { ClientRequestUser } from '../interfaces/client-request.interface';
import { ClientJobsService } from '../services/client-jobs.service';

@Public()
@UseGuards(ClientHttpAuthGuard)
@Controller('client/api/jobs')
export class ClientJobsController {
  constructor(private readonly jobsService: ClientJobsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listJobs(
    @CurrentClient() client: ClientRequestUser,
    @Query() query: ListClientJobsDto,
  ) {
    const result = await this.jobsService.listJobs(
      client.businessId,
      client.clientId,
      query,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.JOB.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getJob(
    @CurrentClient() client: ClientRequestUser,
    @Param() params: IdParamDto,
  ) {
    const result = await this.jobsService.getJob(
      client.businessId,
      client.clientId,
      params.id,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.JOB.SUCCESS.FOUND,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}
