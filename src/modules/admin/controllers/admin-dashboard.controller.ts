import { Controller, Get, HttpException, UseGuards } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';

@Public()
@SkipSignature()
@UseGuards(JwtAdminAuthGuard)
@Controller('admin/api/dashboard')
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get()
  async getDashboard() {
    const result = await this.adminDashboardService.getDashboardStats();
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.DASHBOARD, data: result };
  }

  @Get('recent-activities')
  async getRecentActivities() {
    const result = await this.adminDashboardService.getRecentActivities();
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.RECENT_ACTIVITIES, data: result };
  }
}
