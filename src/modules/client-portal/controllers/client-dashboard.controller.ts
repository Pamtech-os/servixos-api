import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentClient } from '../decorators/current-client.decorator';
import type { ClientRequestUser } from '../interfaces/client-request.interface';
import { ClientHttpAuthGuard } from '../guards/client-http-auth.guard';
import { ClientDashboardService } from '../services/client-dashboard.service';

@Public()
@UseGuards(ClientHttpAuthGuard)
@Controller('client/api/dashboard')
export class ClientDashboardController {
  constructor(private readonly dashboardService: ClientDashboardService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getDashboard(@CurrentClient() client: ClientRequestUser) {
    const result = await this.dashboardService.getDashboard(
      client.businessId,
      client.clientId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.DASHBOARD.SUCCESS.RETRIEVED,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}
