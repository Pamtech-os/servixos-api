import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Job as AgendaJob } from 'agenda';
import { Types } from 'mongoose';
import { ACTIVITY_LOGS_MESSAGES } from 'src/common/constants/messages/activity-logs.messages';
import { CACHE_TTL } from 'src/common/constants/cache-ttl.constants';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { AgendaService } from '../agenda/agenda.service';
import { JOBS } from '../agenda/agenda.constants';
import { BusinessRepository } from '../business/business.repository';
import { RedisService } from '../redis/redis.service';
import { UsersRepository } from '../users/users.repository';
import { ActivityLogsRepository } from './activity-logs.repository';
import { QueryActivityLogsDto } from './dto/query-activity-logs.dto';
import { ActivityLog, LogCategory } from './schemas/activity-log.schema';

export interface CreateActivityLogParams {
  businessId: string;
  actorId: string;
  actorRole: string;
  action: string;
  category: LogCategory;
  resourceId?: string;
  resourceType?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface IpGeoResult {
  city?: string;
  country?: string;
}

interface PaginatedActivityLogs {
  data: ActivityLog[];
  meta: ReturnType<typeof buildMeta>;
}

const USER_NAME_CACHE_PREFIX = 'user:name:';
const BUSINESS_TZ_CACHE_PREFIX = 'business:tz:';
const USER_NAME_CACHE_TTL = 60 * 30; // 30 minutes
const BUSINESS_TZ_CACHE_TTL = 60 * 60; // 1 hour
const IP_GEO_TIMEOUT_MS = 500;
const PRIVATE_IP_PREFIXES = [
  '127.',
  '192.168.',
  '10.',
  '172.16.',
  '::1',
  'localhost',
];

const activityLogsListCacheKey = (businessId: string, params: string): string =>
  `${businessId}:activity-logs:list:${params}`;

@Injectable()
export class ActivityLogsService implements OnModuleInit {
  private readonly logger = new Logger(ActivityLogsService.name);

  constructor(
    private readonly activityLogsRepository: ActivityLogsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly businessRepository: BusinessRepository,
    private readonly redisService: RedisService,
    private readonly agendaService: AgendaService,
  ) {}

  onModuleInit(): void {
    this.agendaService.define(
      JOBS.ACTIVITY_LOG_WRITE,
      async (job: AgendaJob): Promise<void> => {
        const params = job.attrs.data as CreateActivityLogParams;
        await this.log(params);
      },
    );
  }

  /**
   * Creates an activity log entry for a mutating operation.
   * Designed to be called fire-and-forget (void) — all errors are caught internally.
   *
   * Flow:
   *   1. Resolve actor name from Redis cache or database.
   *   2. Resolve business timezone from Redis cache or database.
   *   3. Fetch city/country from ip-api.com with a 500ms timeout.
   *   4. Convert the current UTC time to the business's wall-clock time.
   *   5. Persist the log record.
   *
   * Example:
   *   void activityLogsService.log({ businessId, actorId, action: 'Created client', ... });
   */
  async log(params: CreateActivityLogParams): Promise<void> {
    try {
      const [actorName, timezone] = await Promise.all([
        this.resolveActorName(params.actorId),
        this.resolveBusinessTimezone(params.businessId),
      ]);

      const geo = params.ipAddress
        ? await this.fetchGeoFromIp(params.ipAddress)
        : {};

      const timestamp = this.toBusinessLocalTime(new Date(), timezone);

      await this.activityLogsRepository.create({
        businessId: new Types.ObjectId(params.businessId),
        actorId: new Types.ObjectId(params.actorId),
        actorName,
        actorRole: params.actorRole,
        action: params.action,
        category: params.category,
        resourceId: params.resourceId
          ? new Types.ObjectId(params.resourceId)
          : undefined,
        resourceType: params.resourceType,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        city: geo.city,
        country: geo.country,
        timestamp,
      });
    } catch (error) {
      // Never propagate — log creation must not disrupt the request lifecycle
      this.logger.error(
        `log: failed to create activity log [businessId=${params.businessId}, actorId=${params.actorId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
    }
  }

  async listLogs(
    businessId: string,
    dto: QueryActivityLogsDto,
  ): Promise<PaginatedActivityLogs | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const cacheKey = activityLogsListCacheKey(
        businessId,
        `${dto.search ?? ''}:${dto.category ?? ''}:${dto.dateFrom ?? ''}:${dto.dateTo ?? ''}:${pagination.page}:${pagination.limit}`,
      );

      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as PaginatedActivityLogs;
      }

      const { data, total } = await this.activityLogsRepository.findAll(
        new Types.ObjectId(businessId),
        {
          search: dto.search,
          category: dto.category,
          dateFrom: dto.dateFrom ? new Date(dto.dateFrom) : undefined,
          dateTo: dto.dateTo ? new Date(dto.dateTo) : undefined,
        },
        pagination,
      );

      const result: PaginatedActivityLogs = {
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CACHE_TTL.ACTIVITY_LOGS)
        .catch((err: unknown) =>
          this.logger.warn(
            `listLogs: cache write failed [businessId=${businessId}]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      return result;
    } catch (error) {
      this.logger.error(
        `listLogs: unexpected error [businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Resolves the display name for a user with a Redis cache-aside pattern.
   * Falls back to "Unknown User" if the user record cannot be found.
   */
  private async resolveActorName(userId: string): Promise<string> {
    const cacheKey = `${USER_NAME_CACHE_PREFIX}${userId}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) return cached;

      const user = await this.usersRepository.findById(userId);
      const name = user
        ? `${user.firstName} ${user.lastName}`.trim()
        : 'Unknown User';

      await this.redisService
        .set(cacheKey, name, USER_NAME_CACHE_TTL)
        .catch(() => undefined);

      return name;
    } catch {
      return 'Unknown User';
    }
  }

  /**
   * Resolves the IANA timezone string for a business with a Redis cache-aside pattern.
   * Falls back to 'UTC' if the business record cannot be found.
   */
  private async resolveBusinessTimezone(businessId: string): Promise<string> {
    const cacheKey = `${BUSINESS_TZ_CACHE_PREFIX}${businessId}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) return cached;

      const business = await this.businessRepository.findById(businessId);
      const timezone = business?.timezone ?? 'UTC';

      await this.redisService
        .set(cacheKey, timezone, BUSINESS_TZ_CACHE_TTL)
        .catch(() => undefined);

      return timezone;
    } catch {
      return 'UTC';
    }
  }

  /**
   * Converts a UTC Date to its wall-clock equivalent in the given IANA timezone.
   * The returned Date, when formatted as UTC, shows the local time components.
   *
   * Example: UTC 15:00, timezone "America/New_York" (UTC-5) → stored as 10:00Z.
   * This lets consumers display the stored value directly without further conversion.
   */
  private toBusinessLocalTime(utcDate: Date, timezone: string): Date {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(utcDate);

      const p: Record<string, string> = {};
      for (const part of parts) {
        p[part.type] = part.value;
      }

      // hour '24' is returned for midnight in some locales — normalise to '00'
      const hour = p['hour'] === '24' ? '00' : p['hour'];
      const localStr = `${p['year']}-${p['month']}-${p['day']}T${hour}:${p['minute']}:${p['second']}`;

      return new Date(localStr + 'Z');
    } catch {
      return utcDate;
    }
  }

  /**
   * Looks up approximate city and country for a given IP address using ip-api.com.
   * Silently returns empty on failure or timeout — never throws.
   * Private and loopback IPs are skipped immediately.
   *
   * Docs: https://ip-api.com/docs/api:json
   */
  private async fetchGeoFromIp(ip: string): Promise<IpGeoResult> {
    const isPrivate = PRIVATE_IP_PREFIXES.some((prefix) =>
      ip.startsWith(prefix),
    );
    if (isPrivate) return {};

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IP_GEO_TIMEOUT_MS);

    try {
      const response = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,city,country`,
        { signal: controller.signal },
      );

      const data = (await response.json()) as {
        status?: string;
        city?: string;
        country?: string;
      };

      if (data.status === 'success') {
        return { city: data.city, country: data.country };
      }
      return {};
    } catch {
      return {};
    } finally {
      clearTimeout(timer);
    }
  }
}

// Re-export to allow services to emit logs directly (e.g. login, export events)
export { ACTIVITY_LOGS_MESSAGES };
