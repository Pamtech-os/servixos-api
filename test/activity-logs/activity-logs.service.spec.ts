import { InternalServerErrorException, Logger } from '@nestjs/common';
import { asMock } from 'test/helpers/mock';
import { Types } from 'mongoose';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { ActivityLogsRepository } from 'src/modules/activity-logs/repositories/activity-logs.repository';
import {
  ActivityLogsService,
  CreateActivityLogParams,
} from 'src/modules/activity-logs/services/activity-logs.service';
import {
  ActivityLog,
  LogCategory,
} from 'src/modules/activity-logs/schemas/activity-log.schema';

const BUSINESS_ID = '664abc123456789012345678';
const ACTOR_ID = '664abc000000000000000001';

const baseLog: ActivityLog = {
  _id: new Types.ObjectId(),
  businessId: new Types.ObjectId(BUSINESS_ID),
  actorId: new Types.ObjectId(ACTOR_ID),
  actorName: 'Jane Smith',
  actorRole: 'owner',
  action: 'Created client',
  category: LogCategory.CLIENT,
  timestamp: new Date('2026-05-07T10:00:00Z'),
};

const baseParams: CreateActivityLogParams = {
  businessId: BUSINESS_ID,
  actorId: ACTOR_ID,
  actorRole: 'owner',
  action: 'Created client',
  category: LogCategory.CLIENT,
  resourceId: new Types.ObjectId().toString(),
  ipAddress: '127.0.0.1',
  userAgent: 'Jest/1.0',
};

describe('ActivityLogsService', () => {
  let service: ActivityLogsService;
  let activityLogsRepository: { create: jest.Mock; findAll: jest.Mock };
  let usersRepository: { findById: jest.Mock };
  let businessRepository: { findById: jest.Mock };
  let redisService: { get: jest.Mock; set: jest.Mock };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    activityLogsRepository = {
      create: jest.fn().mockResolvedValue(baseLog),
      findAll: jest.fn(),
    };
    usersRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(ACTOR_ID),
        firstName: 'Jane',
        lastName: 'Smith',
      }),
    };
    businessRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(BUSINESS_ID),
        timezone: 'America/New_York',
      }),
    };
    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const agendaService = asMock<AgendaService>({ define: jest.fn() });

    service = new ActivityLogsService(
      asMock<ActivityLogsRepository>(activityLogsRepository),
      asMock<UsersRepository>(usersRepository),
      asMock<BusinessRepository>(businessRepository),
      asMock<RedisService>(redisService),
      agendaService,
    );

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  // ─── log ────────────────────────────────────────────────────────────────────

  describe('log', () => {
    it('should create a log entry with resolved actor name and timezone timestamp', async () => {
      await service.log(baseParams);

      expect(activityLogsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actorName: 'Jane Smith',
          action: 'Created client',
          category: LogCategory.CLIENT,
        }),
      );
    });

    it('should use cached actor name when available', async () => {
      redisService.get
        .mockResolvedValueOnce('Jane Cached') // actor name cache hit
        .mockResolvedValueOnce('America/New_York'); // timezone cache hit

      await service.log(baseParams);

      expect(usersRepository.findById).not.toHaveBeenCalled();
      expect(activityLogsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ actorName: 'Jane Cached' }),
      );
    });

    it('should fall back to "Unknown User" when user record is missing', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await service.log(baseParams);

      expect(activityLogsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ actorName: 'Unknown User' }),
      );
    });

    it('should not throw when repository.create fails', async () => {
      activityLogsRepository.create.mockRejectedValue(new Error('db error'));

      await expect(service.log(baseParams)).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should skip IP geo lookup for loopback addresses', async () => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response());

      await service.log({ ...baseParams, ipAddress: '127.0.0.1' });

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  // ─── listLogs ───────────────────────────────────────────────────────────────

  describe('listLogs', () => {
    it('should return cached result on cache hit', async () => {
      const cached = {
        data: [baseLog],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      redisService.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.listLogs(BUSINESS_ID, {
        page: 1,
        limit: 10,
      });

      expect(activityLogsRepository.findAll).not.toHaveBeenCalled();
      // After JSON.parse, Dates become strings and ObjectIds become strings — compare serialized
      expect(JSON.stringify(result)).toEqual(JSON.stringify(cached));
    });

    it('should query repository and cache result on cache miss', async () => {
      activityLogsRepository.findAll.mockResolvedValue({
        data: [baseLog],
        total: 1,
      });

      const result = await service.listLogs(BUSINESS_ID, {
        page: 1,
        limit: 10,
      });

      expect(activityLogsRepository.findAll).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalled();
      expect(result).not.toBeInstanceOf(InternalServerErrorException);
    });

    it('should filter by category when provided', async () => {
      activityLogsRepository.findAll.mockResolvedValue({ data: [], total: 0 });

      await service.listLogs(BUSINESS_ID, { category: LogCategory.CLIENT });

      expect(activityLogsRepository.findAll).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.objectContaining({ category: LogCategory.CLIENT }),
        expect.any(Object),
      );
    });

    it('should filter by date range when provided', async () => {
      activityLogsRepository.findAll.mockResolvedValue({ data: [], total: 0 });

      await service.listLogs(BUSINESS_ID, {
        dateFrom: '2026-05-01T00:00:00Z',
        dateTo: '2026-05-07T23:59:59Z',
      });

      expect(activityLogsRepository.findAll).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.objectContaining({
          dateFrom: expect.any(Date) as unknown,
          dateTo: expect.any(Date) as unknown,
        }),
        expect.any(Object),
      );
    });

    it('should return InternalServerErrorException when repository throws', async () => {
      activityLogsRepository.findAll.mockRejectedValue(new Error('db error'));

      const result = await service.listLogs(BUSINESS_ID, {});

      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });
});
