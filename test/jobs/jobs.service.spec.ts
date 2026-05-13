import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { JOBS_MESSAGES } from 'src/common/constants/messages/jobs.messages';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { ClientsRepository } from 'src/modules/clients/repositories/clients.repository';
import { EmailService } from 'src/modules/email/services/email.service';
import { InvoicesService } from 'src/modules/invoices/services/invoices.service';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { ContractsRepository } from 'src/modules/contracts/repositories/contracts.repository';
import { JobsRepository } from 'src/modules/jobs/repositories/jobs.repository';
import { JobsService } from 'src/modules/jobs/services/jobs.service';
import { Job, JobStatus } from 'src/modules/jobs/schemas/job.schema';
import { StorageService } from 'src/modules/storage/storage.service';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = '664abc123456789012345678';
const JOB_ID = '664abc000000000000000001';
const CLIENT_ID = '664abc000000000000000002';

const baseJob = (status: JobStatus): Job => ({
  _id: new Types.ObjectId(JOB_ID),
  businessId: new Types.ObjectId(BUSINESS_ID),
  clientId: new Types.ObjectId(CLIENT_ID),
  title: 'AC Repair',
  scheduledDate: new Date('2026-05-09T10:00:00.000Z'),
  price: 200,
  status,
  timezone: 'America/New_York',
});

describe('JobsService (start/complete)', () => {
  let service: JobsService;
  let jobsRepository: {
    findById: jest.Mock;
    transitionStatusById: jest.Mock;
    updateById: jest.Mock;
  };
  let redisService: {
    set: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
  };
  let invoicesService: {
    getPaidSummaryForJob: jest.Mock;
  };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jobsRepository = {
      findById: jest.fn(),
      transitionStatusById: jest.fn(),
      updateById: jest.fn(),
    };

    redisService = {
      set: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(undefined),
    };
    invoicesService = {
      getPaidSummaryForJob: jest
        .fn()
        .mockResolvedValue({ amountPaid: 100, totalInvoiced: 200 }),
    };

    const config = { get: jest.fn().mockReturnValue(undefined) };
    const agendaService = { define: jest.fn() };

    service = new JobsService(
      asMock<ConfigService>(config),
      asMock<JobsRepository>(jobsRepository),
      {} as ContractsRepository,
      {} as ClientsRepository,
      {} as BusinessRepository,
      asMock<AgendaService>(agendaService),
      asMock<RedisService>(redisService),
      {} as EmailService,
      asMock<InvoicesService>(invoicesService),
      {} as StorageService,
    );

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  describe('startJob', () => {
    it('starts a pending job atomically and updates cache', async () => {
      const pending = baseJob(JobStatus.PENDING);
      const started = {
        ...pending,
        status: JobStatus.IN_PROGRESS,
        startedAt: new Date('2026-05-08T11:00:00.000Z'),
      };
      jobsRepository.findById.mockResolvedValueOnce(pending);
      jobsRepository.transitionStatusById.mockResolvedValueOnce(started);

      const result = await service.startJob(JOB_ID, BUSINESS_ID);

      expect(jobsRepository.transitionStatusById).toHaveBeenCalledWith(
        JOB_ID,
        expect.any(Types.ObjectId),
        [JobStatus.PENDING],
        expect.objectContaining({
          status: JobStatus.IN_PROGRESS,
          startedAt: expect.any(Date) as unknown,
          completedAt: undefined,
        }),
      );
      expect(redisService.incr).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalledTimes(1);
      expect(result).toEqual(started);
    });

    it('returns 400 when upfront deposit is below 50%', async () => {
      jobsRepository.findById.mockResolvedValueOnce(baseJob(JobStatus.PENDING));
      invoicesService.getPaidSummaryForJob.mockResolvedValueOnce({
        amountPaid: 80,
        totalInvoiced: 200,
      });

      const result = await service.startJob(JOB_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(BadRequestException);
      expect((result as BadRequestException).message).toBe(
        JOBS_MESSAGES.ERROR.DEPOSIT_REQUIRED_TO_START,
      );
      expect(jobsRepository.transitionStatusById).not.toHaveBeenCalled();
    });

    it('returns 400 when job price is missing under deposit policy', async () => {
      jobsRepository.findById.mockResolvedValueOnce({
        ...baseJob(JobStatus.PENDING),
        price: undefined,
      });

      const result = await service.startJob(JOB_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(BadRequestException);
      expect((result as BadRequestException).message).toBe(
        JOBS_MESSAGES.ERROR.PRICE_REQUIRED_TO_START,
      );
      expect(invoicesService.getPaidSummaryForJob).not.toHaveBeenCalled();
    });

    it('returns existing job when it is already in progress (idempotent)', async () => {
      const inProgress = baseJob(JobStatus.IN_PROGRESS);
      jobsRepository.findById.mockResolvedValueOnce(inProgress);

      const result = await service.startJob(JOB_ID, BUSINESS_ID);

      expect(jobsRepository.transitionStatusById).not.toHaveBeenCalled();
      expect(result).toEqual(inProgress);
    });

    it('returns 400 when starting a completed job', async () => {
      jobsRepository.findById.mockResolvedValueOnce(
        baseJob(JobStatus.COMPLETED),
      );

      const result = await service.startJob(JOB_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(BadRequestException);
      expect((result as BadRequestException).message).toBe(
        JOBS_MESSAGES.ERROR.START_NOT_ALLOWED,
      );
    });

    it('returns 404 when job does not exist', async () => {
      jobsRepository.findById.mockResolvedValueOnce(null);

      const result = await service.startJob(JOB_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        JOBS_MESSAGES.ERROR.NOT_FOUND,
      );
    });
  });

  describe('updateJob', () => {
    it('updates only editable fields through update endpoint', async () => {
      const existing = baseJob(JobStatus.PENDING);
      const updated = {
        ...existing,
        title: 'Updated title',
      };
      jobsRepository.findById.mockResolvedValueOnce(existing);
      jobsRepository.updateById.mockResolvedValueOnce(updated);

      const result = await service.updateJob(JOB_ID, BUSINESS_ID, {
        title: 'Updated title',
      });

      expect(jobsRepository.updateById).toHaveBeenCalledWith(
        JOB_ID,
        expect.any(Types.ObjectId),
        expect.objectContaining({
          title: 'Updated title',
        }),
      );
      expect(result).toEqual(updated);
    });

    it('ignores injected status in runtime payload and does not mutate lifecycle fields', async () => {
      const existing = baseJob(JobStatus.PENDING);
      const updated = {
        ...existing,
        notes: 'safe note',
      };
      jobsRepository.findById.mockResolvedValueOnce(existing);
      jobsRepository.updateById.mockResolvedValueOnce(updated);

      const maliciousPayload = {
        notes: 'safe note',
        status: JobStatus.COMPLETED,
      } as {
        title?: string;
        description?: string;
        scheduledDate?: string;
        location?: string;
        price?: number;
        notes?: string;
      };

      await service.updateJob(JOB_ID, BUSINESS_ID, maliciousPayload);

      const updateCalls = jobsRepository.updateById.mock.calls as Array<
        [string, Types.ObjectId, Record<string, unknown>]
      >;
      const updateArg = updateCalls[0]?.[2];

      expect(updateArg).toBeDefined();
      expect(updateArg?.notes).toBe('safe note');
      expect(updateArg).not.toHaveProperty('status');
      expect(updateArg).not.toHaveProperty('completedAt');
    });
  });

  describe('completeJob', () => {
    it('completes an in-progress job atomically and updates cache', async () => {
      const inProgress = baseJob(JobStatus.IN_PROGRESS);
      const completed = {
        ...inProgress,
        status: JobStatus.COMPLETED,
        completedAt: new Date('2026-05-08T12:00:00.000Z'),
      };
      jobsRepository.findById.mockResolvedValueOnce(inProgress);
      jobsRepository.transitionStatusById.mockResolvedValueOnce(completed);

      const result = await service.completeJob(JOB_ID, BUSINESS_ID);

      expect(jobsRepository.transitionStatusById).toHaveBeenCalledWith(
        JOB_ID,
        expect.any(Types.ObjectId),
        [JobStatus.IN_PROGRESS],
        expect.objectContaining({
          status: JobStatus.COMPLETED,
          completedAt: expect.any(Date) as unknown,
        }),
      );
      expect(redisService.incr).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalledTimes(1);
      expect(result).toEqual(completed);
    });

    it('returns existing job when it is already completed (idempotent)', async () => {
      const completed = baseJob(JobStatus.COMPLETED);
      jobsRepository.findById.mockResolvedValueOnce(completed);

      const result = await service.completeJob(JOB_ID, BUSINESS_ID);

      expect(jobsRepository.transitionStatusById).not.toHaveBeenCalled();
      expect(result).toEqual(completed);
    });

    it('returns 400 when completing a pending job', async () => {
      jobsRepository.findById.mockResolvedValueOnce(baseJob(JobStatus.PENDING));

      const result = await service.completeJob(JOB_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(BadRequestException);
      expect((result as BadRequestException).message).toBe(
        JOBS_MESSAGES.ERROR.COMPLETE_NOT_ALLOWED,
      );
    });

    it('returns 404 when job does not exist', async () => {
      jobsRepository.findById.mockResolvedValueOnce(null);

      const result = await service.completeJob(JOB_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        JOBS_MESSAGES.ERROR.NOT_FOUND,
      );
    });

    it('returns 500 when repository throws unexpectedly', async () => {
      jobsRepository.findById.mockRejectedValue(new Error('db outage'));

      const result = await service.completeJob(JOB_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect((result as InternalServerErrorException).message).toBe(
        COMMON_MESSAGES.ERROR.INTERNAL,
      );
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });
});
