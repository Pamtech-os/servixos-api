import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipSignature } from 'src/common/decorators/skip-signature.decorator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';
import { AdminBusinessesService } from '../services/admin-businesses.service';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { QueryAdminBusinessesDto } from '../dto/query-businesses.dto';
import {
  BulkBusinessIdsDto,
  BulkBusinessSendEmailDto,
  SendEmailToUserDto,
} from '../dto/send-email.dto';

@Public()
@SkipSignature()
@UseGuards(JwtAdminAuthGuard)
@Controller('admin/api/businesses')
export class AdminBusinessesController {
  constructor(
    private readonly adminBusinessesService: AdminBusinessesService,
  ) {}

  @Get()
  async listBusinesses(@Query() dto: QueryAdminBusinessesDto) {
    const result = await this.adminBusinessesService.listBusinesses(dto);
    if (result instanceof HttpException) throw result;
    return {
      message: ADMIN_MESSAGES.SUCCESS.BUSINESSES_RETRIEVED,
      data: result,
    };
  }

  @Get(':id')
  async getBusiness(@Param('id') id: string) {
    const result = await this.adminBusinessesService.getBusinessById(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.BUSINESS_RETRIEVED, data: result };
  }

  @Patch(':id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendBusiness(@Param('id') id: string) {
    const result = await this.adminBusinessesService.suspendBusiness(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.BUSINESS_SUSPENDED };
  }

  @Patch(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivateBusiness(@Param('id') id: string) {
    const result = await this.adminBusinessesService.reactivateBusiness(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.BUSINESS_REACTIVATED };
  }

  @Patch('bulk/toggle-suspend')
  @HttpCode(HttpStatus.OK)
  async bulkToggleSuspend(@Body() dto: BulkBusinessIdsDto) {
    const result = await this.adminBusinessesService.bulkToggleSuspend(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.BUSINESSES_UPDATED, data: result };
  }

  @Post('send-email')
  @HttpCode(HttpStatus.OK)
  async bulkSendEmail(@Body() dto: BulkBusinessSendEmailDto) {
    const result = await this.adminBusinessesService.bulkSendEmail(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.EMAIL_SENT, data: result };
  }

  @Post(':id/send-email')
  @HttpCode(HttpStatus.OK)
  async sendEmailToBusiness(
    @Param('id') id: string,
    @Body() dto: SendEmailToUserDto,
  ) {
    const result = await this.adminBusinessesService.sendEmailToBusiness(
      id,
      dto,
    );
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.EMAIL_SENT };
  }
}
