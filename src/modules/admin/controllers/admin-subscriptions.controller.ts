import { Controller, Get, HttpException, UseGuards } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { AdminSubscriptionsService } from '../services/admin-subscriptions.service';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';

@Public()
@SkipSignature()
@UseGuards(JwtAdminAuthGuard)
@Controller('admin/api/subscriptions')
export class AdminSubscriptionsController {
  constructor(
    private readonly adminSubscriptionsService: AdminSubscriptionsService,
  ) {}

  @Get()
  async getSubscriptions() {
    const result =
      await this.adminSubscriptionsService.getSubscriptionAnalytics();
    if (result instanceof HttpException) throw result;
    return {
      message: ADMIN_MESSAGES.SUCCESS.SUBSCRIPTIONS_RETRIEVED,
      data: result,
    };
  }
}
