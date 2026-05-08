import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentClient } from '../decorators/current-client.decorator';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ClientHttpAuthGuard } from '../guards/client-http-auth.guard';
import type { ClientRequestUser } from '../interfaces/client-request.interface';
import { ClientProfileService } from '../services/client-profile.service';

@Public()
@UseGuards(ClientHttpAuthGuard)
@Controller('client/api/profile')
export class ClientProfileController {
  constructor(private readonly profileService: ClientProfileService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getProfile(@CurrentClient() client: ClientRequestUser) {
    const result = await this.profileService.getProfile(
      client.businessId,
      client.clientId,
      client.userId,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.PROFILE.SUCCESS.RETRIEVED,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentClient() client: ClientRequestUser,
    @Body() dto: UpdateProfileDto,
  ) {
    const result = await this.profileService.updateProfile(
      client.clientId,
      client.userId,
      dto,
    );
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.PROFILE.SUCCESS.UPDATED,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentClient() client: ClientRequestUser,
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.profileService.changePassword(client.userId, dto);
    if (result instanceof HttpException) throw result;

    return {
      message: CLIENT_MESSAGES.AUTH.SUCCESS.PASSWORD_CHANGED,
      data: null,
      timestamp: new Date().toISOString(),
    };
  }
}
