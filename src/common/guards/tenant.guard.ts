import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TENANT_MESSAGES } from '../constants/messages/tenant.messages';
import { BusinessRepository } from 'src/modules/business/business.repository';
import { JwtUser } from '../decorators/current-user.decorator';
import { SubscriptionStatus } from 'src/modules/business/schemas/business.schema';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly businessRepository: BusinessRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user: JwtUser }>();
    const businessId = req.headers['x-business-id'] as string | undefined;

    if (!businessId) {
      throw new BadRequestException(TENANT_MESSAGES.ERROR.MISSING_HEADER);
    }

    if (!Types.ObjectId.isValid(businessId)) {
      throw new BadRequestException(TENANT_MESSAGES.ERROR.INVALID_FORMAT);
    }

    const business = await this.businessRepository.findById(businessId);

    if (!business) {
      throw new UnauthorizedException(TENANT_MESSAGES.ERROR.NOT_FOUND);
    }

    if (business.deletedAt) {
      throw new ForbiddenException(TENANT_MESSAGES.ERROR.DELETED);
    }

    if (
      business.subscriptionStatus === SubscriptionStatus.CANCELED ||
      business.subscriptionStatus === SubscriptionStatus.LOCKED
    ) {
      throw new ForbiddenException(TENANT_MESSAGES.ERROR.INACTIVE);
    }

    if (req.user.businessId !== businessId) {
      throw new ForbiddenException(TENANT_MESSAGES.ERROR.MISMATCH);
    }

    return true;
  }
}
