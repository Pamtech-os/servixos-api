import { Controller, Get, NotFoundException } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUser } from 'src/common/decorators/current-user.decorator';
import { BusinessRepository } from '../repositories/business.repository';
import { SETTINGS_MESSAGES } from 'src/common/constants/messages/settings.messages';
import type { ServiceResponse } from 'src/common/dto/response.dto';
import { AllowLocked } from 'src/common/decorators/allow-locked.decorator';

@Controller()
export class BusinessController {
  constructor(private readonly businessRepository: BusinessRepository) {}

  /**
   * Returns the full business profile including the current subscription plan,
   * status, features, and billing details.
   */
  @AllowLocked()
  @Get('me')
  async getMe(@CurrentUser() user: JwtUser): Promise<ServiceResponse> {
    const business = await this.businessRepository.findById(user.businessId);

    if (!business)
      throw new NotFoundException(SETTINGS_MESSAGES.ERROR.PROFILE_NOT_FOUND);

    return {
      message: SETTINGS_MESSAGES.SUCCESS.PROFILE_RETRIEVED,
      data: {
        id: business._id,
        name: business.name,
        subdomain: business.subdomain,
        email: business.email,
        phone: business.phone,
        address: business.address,
        description: business.description,
        categoryId: business.categoryId,
        categoryName: business.categoryName,
        colors: business.colors,
        font: business.font,
        services: business.services,
        timezone: business.timezone,
        notifications: business.notifications,
        subscription: {
          plan: business.subscription.plan,
          status: business.subscription.status,
          features: business.subscription.features,
          billingInterval: business.billingInterval ?? 'monthly',
          hasPaymentMethod: business.subscription.hasPaymentMethod,
          trialEndsAt: business.subscription.trialEndsAt,
          currentPeriodEnd: business.subscription.currentPeriodEnd,
          gracePeriodEndsAt: business.subscription.gracePeriodEndsAt,
        },
      },
    };
  }
}
