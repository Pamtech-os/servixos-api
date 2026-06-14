import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminReportsService } from '../services/admin-reports.service';
import { CreateReportDto } from '../dto/create-report.dto';
import { QueryReportsDto } from '../dto/query-reports.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';

@Public()
@SkipSignature()
@UseGuards(JwtAdminAuthGuard)
@Controller('admin/api/reports')
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

  @Get('stats')
  async getStats() {
    const result = await this.adminReportsService.getStats();
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.REPORTS_STATS, data: result };
  }

  @Get()
  async listReports(@Query() dto: QueryReportsDto) {
    const result = await this.adminReportsService.listReports(dto);
    if (result instanceof HttpException) throw result;
    return {
      message: ADMIN_MESSAGES.SUCCESS.REPORTS_RETRIEVED,
      data: result.reports,
      meta: result.meta,
    };
  }

  @Get('scheduled')
  async listSchedules(@Query() dto: PaginationDto) {
    const result = await this.adminReportsService.listSchedules(dto);
    if (result instanceof HttpException) throw result;
    return {
      message: ADMIN_MESSAGES.SUCCESS.SCHEDULES_RETRIEVED,
      data: result.schedules,
      meta: result.meta,
    };
  }

  @Post()
  async generateReport(@Body() dto: CreateReportDto) {
    const result = await this.adminReportsService.generateReport(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.REPORT_QUEUED, data: result };
  }

  @Get(':id/download')
  async downloadReport(@Param('id') id: string) {
    const result = await this.adminReportsService.getDownloadUrl(id);
    if (result instanceof HttpException) throw result;
    return {
      message: ADMIN_MESSAGES.SUCCESS.REPORT_DOWNLOAD_URL,
      data: result,
    };
  }

  @Delete(':id')
  async deleteReport(@Param('id') id: string) {
    const result = await this.adminReportsService.deleteReport(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.REPORT_DELETED };
  }

  @Patch('scheduled/:id/pause')
  async pauseSchedule(@Param('id') id: string) {
    const result = await this.adminReportsService.pauseSchedule(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.SCHEDULE_PAUSED };
  }

  @Patch('scheduled/:id/resume')
  async resumeSchedule(@Param('id') id: string) {
    const result = await this.adminReportsService.resumeSchedule(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.SCHEDULE_RESUMED };
  }

  @Post('scheduled/:id/run')
  async runScheduleNow(@Param('id') id: string) {
    const result = await this.adminReportsService.runScheduleNow(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.SCHEDULE_TRIGGERED };
  }

  @Delete('scheduled/:id')
  async deleteSchedule(@Param('id') id: string) {
    const result = await this.adminReportsService.deleteSchedule(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.SCHEDULE_DELETED };
  }
}
