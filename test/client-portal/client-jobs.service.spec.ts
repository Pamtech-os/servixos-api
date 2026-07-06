import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { JobsRepository } from 'src/modules/jobs/repositories/jobs.repository';
import { JobStatus } from 'src/modules/jobs/schemas/job.schema';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { ClientJobsService } from 'src/modules/client-portal/services/client-jobs.service';
import { ListClientJobsDto } from 'src/modules/client-portal/dto/list-client-jobs.dto';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = new Types.ObjectId().toString();
const CLIENT_ID = new Types.ObjectId().toString();
const JOB_ID = new Types.ObjectId().toString();

describe('ClientJobsService', () => {
  let service: ClientJobsService;

  let jobsRepository: {
    findAll: jest.Mock;
    findByIdForClient: jest.Mock;
  };
  let redisService: {
    get: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(() => {
    jobsRepository = {
      findAll: jest.fn(),
      findByIdForClient: jest.fn(),
    };
    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    service = new ClientJobsService(
      asMock<JobsRepository>(jobsRepository),
      asMock<RedisService>(redisService),
    );
  });

  it('lists jobs scoped to the calling client', async () => {
    // Arrange
    const dto: ListClientJobsDto = { page: 1, limit: 10 };
    jobsRepository.findAll.mockResolvedValue({
      data: [
        {
          _id: new Types.ObjectId(JOB_ID),
          title: 'Fix sink',
          scheduledDate: new Date('2026-05-08T12:00:00.000Z'),
          status: JobStatus.PENDING,
        },
      ],
      total: 1,
    });

    // Act
    const result = await service.listJobs(BUSINESS_ID, CLIENT_ID, dto);

    // Assert
    expect(jobsRepository.findAll).toHaveBeenCalledWith(
      new Types.ObjectId(BUSINESS_ID),
      { clientId: CLIENT_ID, status: undefined },
      { page: 1, limit: 10, skip: 0 },
    );
    const payload = result as { data: Array<{ id: string; status: string }> };
    expect(payload.data[0].id).toBe(JOB_ID);
    expect(payload.data[0].status).toBe('pending');
  });

  it('returns cached job list without querying the repository', async () => {
    // Arrange
    const cached = { data: [], meta: { total: 0 } };
    redisService.get.mockResolvedValue(JSON.stringify(cached));

    // Act
    const result = await service.listJobs(BUSINESS_ID, CLIENT_ID, {});

    // Assert
    expect(result).toEqual(cached);
    expect(jobsRepository.findAll).not.toHaveBeenCalled();
  });

  it('returns not found when the job does not belong to the client', async () => {
    // Arrange
    jobsRepository.findByIdForClient.mockResolvedValue(null);

    // Act
    const result = await service.getJob(BUSINESS_ID, CLIENT_ID, JOB_ID);

    // Assert
    expect(result).toBeInstanceOf(NotFoundException);
  });

  it('returns job detail when owned by the calling client', async () => {
    // Arrange
    jobsRepository.findByIdForClient.mockResolvedValue({
      _id: new Types.ObjectId(JOB_ID),
      title: 'Fix sink',
      scheduledDate: new Date('2026-05-08T12:00:00.000Z'),
      status: JobStatus.COMPLETED,
      notes: 'Bring parts',
      startedAt: new Date('2026-05-08T12:00:00.000Z'),
      completedAt: new Date('2026-05-08T14:00:00.000Z'),
    });

    // Act
    const result = await service.getJob(BUSINESS_ID, CLIENT_ID, JOB_ID);

    // Assert
    expect(jobsRepository.findByIdForClient).toHaveBeenCalledWith(
      JOB_ID,
      new Types.ObjectId(BUSINESS_ID),
      new Types.ObjectId(CLIENT_ID),
    );
    const detail = result as { id: string; status: string; notes?: string };
    expect(detail.id).toBe(JOB_ID);
    expect(detail.status).toBe('completed');
    expect(detail.notes).toBe('Bring parts');
  });

  it('returns internal server error when the repository throws', async () => {
    // Arrange
    jobsRepository.findAll.mockRejectedValue(new Error('db down'));

    // Act
    const result = await service.listJobs(BUSINESS_ID, CLIENT_ID, {});

    // Assert
    expect(result).toBeInstanceOf(InternalServerErrorException);
  });
});
