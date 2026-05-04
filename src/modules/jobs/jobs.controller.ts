import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { JOBS_MESSAGES } from 'src/common/constants/messages/jobs.messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { BulkDeleteJobsDto } from './dto/bulk-delete-jobs.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsDto } from './dto/list-jobs.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listJobs(@CurrentUser() user: JwtUser, @Query() query: ListJobsDto) {
    const result = await this.jobsService.listJobs(user.businessId, query);
    if (result instanceof HttpException) throw result;

    return {
      message: JOBS_MESSAGES.SUCCESS.RETRIEVED,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getJob(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const result = await this.jobsService.getJob(id, user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: JOBS_MESSAGES.SUCCESS.FOUND,
      data: result,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createJob(@CurrentUser() user: JwtUser, @Body() dto: CreateJobDto) {
    const result = await this.jobsService.createJob(user.businessId, dto);
    if (result instanceof HttpException) throw result;

    return {
      message: JOBS_MESSAGES.SUCCESS.CREATED,
      data: result,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateJob(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ) {
    const result = await this.jobsService.updateJob(id, user.businessId, dto);
    if (result instanceof HttpException) throw result;

    return {
      message: JOBS_MESSAGES.SUCCESS.UPDATED,
      data: result,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteJob(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const result = await this.jobsService.deleteJob(id, user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: JOBS_MESSAGES.SUCCESS.DELETED,
      data: null,
    };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async bulkDeleteJobs(
    @CurrentUser() user: JwtUser,
    @Body() dto: BulkDeleteJobsDto,
  ) {
    const result = await this.jobsService.bulkDeleteJobs(
      user.businessId,
      dto.ids,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: JOBS_MESSAGES.SUCCESS.DELETED,
      data: result,
    };
  }

  @Post(':id/contract/generate')
  @HttpCode(HttpStatus.OK)
  async generateContract(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    const result = await this.jobsService.generateContract(id, user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: JOBS_MESSAGES.SUCCESS.CONTRACT_GENERATED,
      data: result,
    };
  }

  @Post(':id/contract/send')
  @HttpCode(HttpStatus.OK)
  async sendContract(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const result = await this.jobsService.sendContract(id, user.businessId);
    if (result instanceof HttpException) throw result;

    return {
      message: JOBS_MESSAGES.SUCCESS.CONTRACT_SENT,
      data: result,
    };
  }
}
