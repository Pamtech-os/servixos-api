import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CLIENT_CACHE_KEYS } from 'src/client/constants/cache-keys';
import { CLIENT_CACHE_TTLS } from 'src/client/constants/cache-ttls';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { BusinessRepository } from '../../business/repositories/business.repository';
import { RedisService } from '../../redis/services/redis.service';

@Injectable()
export class ClientContactsService {
  private readonly logger = new Logger(ClientContactsService.name);

  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly redisService: RedisService,
  ) {}

  async listContacts(
    businessId: string,
    clientId: string,
  ): Promise<
    | Array<{
        id: string;
        businessName: string;
        supportEmail?: string;
        phone?: string;
        address?: string;
        website?: string;
        logoUrl: null;
      }>
    | NotFoundException
    | InternalServerErrorException
  > {
    try {
      const cacheKey = CLIENT_CACHE_KEYS.contacts(clientId);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Array<{
          id: string;
          businessName: string;
          supportEmail?: string;
          phone?: string;
          address?: string;
          website?: string;
          logoUrl: null;
        }>;
      }

      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const data = [
        {
          id: business._id.toString(),
          businessName: business.name,
          supportEmail: business.email,
          phone: business.phone,
          address: business.address,
          website: business.subdomain
            ? `https://${business.subdomain}.servixos.com`
            : undefined,
          logoUrl: null,
        },
      ];

      await this.redisService
        .set(cacheKey, JSON.stringify(data), CLIENT_CACHE_TTLS.CONTACTS)
        .catch(() => undefined);

      return data;
    } catch (error) {
      this.logger.error(
        `listContacts: failed [businessId=${businessId}, clientId=${clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }
}
