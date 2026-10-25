import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { SettingsService } from '../services/settings.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UpdateNotificationsDto } from '../dto/update-notifications.dto';
import { UpdatePasswordDto } from '../dto/update-password.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** Returns the business profile fields for the Business settings tab. */
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  getProfile(@CurrentUser() user: JwtUser) {
    return this.settingsService.getProfile(user.businessId);
  }

  /** Updates editable business profile fields. */
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateProfileDto,
  ) {
    const result = await this.settingsService.updateProfile(
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;
    return result;
  }

  /** Returns the current notification preferences for the Notifications tab. */
  @Get('notifications')
  @HttpCode(HttpStatus.OK)
  getNotifications(@CurrentUser() user: JwtUser) {
    return this.settingsService.getNotifications(user.businessId);
  }

  /** Saves notification preference toggles. */
  @Patch('notifications')
  @HttpCode(HttpStatus.OK)
  async updateNotifications(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateNotificationsDto,
  ) {
    const result = await this.settingsService.updateNotifications(
      user.businessId,
      dto,
    );
    if (result instanceof HttpException) throw result;
    return result;
  }

  /** Updates the authenticated user's password. */
  @Patch('password')
  @HttpCode(HttpStatus.OK)
  async updatePassword(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdatePasswordDto,
  ) {
    const result = await this.settingsService.updatePassword(user.sub, dto);
    if (result instanceof HttpException) throw result;
    return result;
  }

  /** Permanently soft-deletes the account and all associated data. */
  @Delete('account')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@CurrentUser() user: JwtUser) {
    const result = await this.settingsService.deleteAccount(
      user.sub,
      user.businessId,
    );
    if (result instanceof HttpException) throw result;
    return result;
  }
}
