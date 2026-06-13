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
import { AdminUsersService } from '../services/admin-users.service';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { QueryAdminUsersDto } from '../dto/query-users.dto';
import { InviteUserDto } from '../dto/invite-user.dto';
import {
  BulkSendEmailDto,
  BulkToggleSuspendDto,
  SendEmailToUserDto,
} from '../dto/send-email.dto';

@Public()
@SkipSignature()
@UseGuards(JwtAdminAuthGuard)
@Controller('admin/api/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  async listUsers(@Query() dto: QueryAdminUsersDto) {
    const result = await this.adminUsersService.listUsers(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.USERS_RETRIEVED, data: result };
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    const result = await this.adminUsersService.getUserById(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.USER_RETRIEVED, data: result };
  }

  @Patch(':id/toggle-suspend')
  @HttpCode(HttpStatus.OK)
  async toggleSuspend(@Param('id') id: string) {
    const result = await this.adminUsersService.toggleSuspend(id);
    if (result instanceof HttpException) throw result;
    const message = (result as { suspended: boolean }).suspended
      ? ADMIN_MESSAGES.SUCCESS.USER_SUSPENDED
      : ADMIN_MESSAGES.SUCCESS.USER_REACTIVATED;
    return { message, data: result };
  }

  @Patch('bulk/toggle-suspend')
  @HttpCode(HttpStatus.OK)
  async bulkToggleSuspend(@Body() dto: BulkToggleSuspendDto) {
    const result = await this.adminUsersService.bulkToggleSuspend(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.USERS_UPDATED, data: result };
  }

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  async inviteUser(@Body() dto: InviteUserDto) {
    const result = await this.adminUsersService.inviteUser(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.USER_INVITED };
  }

  @Post('send-email')
  @HttpCode(HttpStatus.OK)
  async bulkSendEmail(@Body() dto: BulkSendEmailDto) {
    const result = await this.adminUsersService.bulkSendEmail(dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.EMAIL_SENT, data: result };
  }

  @Post(':id/send-email')
  @HttpCode(HttpStatus.OK)
  async sendEmailToUser(
    @Param('id') id: string,
    @Body() dto: SendEmailToUserDto,
  ) {
    const result = await this.adminUsersService.sendEmailToUser(id, dto);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.EMAIL_SENT };
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Param('id') id: string) {
    const result = await this.adminUsersService.resetUserPassword(id);
    if (result instanceof HttpException) throw result;
    return { message: ADMIN_MESSAGES.SUCCESS.PASSWORD_RESET_SENT };
  }
}
