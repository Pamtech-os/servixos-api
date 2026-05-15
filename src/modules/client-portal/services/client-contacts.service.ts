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
import { UsersRepository } from '../../users/repositories/users.repository';

@Injectable()
export class ClientContactsService {
  private readonly logger = new Logger(ClientContactsService.name);

  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly redisService: RedisService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async listContacts(
    businessId: string,
    clientId: string,
  ): Promise<
    | Array<{
        id: string;
        businessName: string;
        businessEmail?: string;
        businessPhone?: string;
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
        const parsed = JSON.parse(cached) as Array<{
          id: string;
          businessName: string;
          businessEmail?: string;
          businessPhone?: string;
          supportEmail?: string;
          phone?: string;
          address?: string;
          website?: string;
          logoUrl: null;
        }>;

        return parsed.map((contact) => ({
          ...contact,
          businessEmail: contact.businessEmail ?? contact.supportEmail,
          businessPhone: contact.businessPhone ?? contact.phone,
        }));
      }

      const business = await this.businessRepository.findById(businessId);
      if (!business || business.deletedAt) {
        return new NotFoundException(COMMON_MESSAGES.ERROR.NOT_FOUND);
      }

      const owner =
        !business.email || !business.phone
          ? await this.usersRepository.findById(business.ownerId.toString())
          : null;

      const businessEmail = business.email ?? owner?.email;
      const businessPhone = business.phone ?? owner?.phone;

      const data = [
        {
          id: business._id.toString(),
          businessName: business.name,
          businessEmail,
          businessPhone,
          supportEmail: businessEmail,
          phone: businessPhone,
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
