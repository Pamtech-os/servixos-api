import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ClientsRepository } from 'src/modules/clients/repositories/clients.repository';
import { ContractsRepository } from 'src/modules/contracts/repositories/contracts.repository';
import { ContractsService } from 'src/modules/contracts/services/contracts.service';
import { ContractStatus } from 'src/modules/contracts/schemas/contract.schema';
import { EmailService } from 'src/modules/email/services/email.service';
import { JobsRepository } from 'src/modules/jobs/repositories/jobs.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { PdfService } from 'src/modules/pdf/pdf.service';
import { StorageService } from 'src/modules/storage/storage.service';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = new Types.ObjectId().toString();
const CLIENT_ID = new Types.ObjectId().toString();
const JOB_ID = new Types.ObjectId().toString();
const CONTRACT_ID = new Types.ObjectId().toString();

describe('ContractsService', () => {
  let service: ContractsService;

  const contractsRepository = {
    findByJobId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateById: jest.fn(),
    softDelete: jest.fn(),
    findAll: jest.fn(),
  };

  const clientsRepository = {
    findById: jest.fn(),
  };

  const jobsRepository = {
    findById: jest.fn(),
  };

  const emailService = {
    send: jest.fn(),
  };

  const redisService = {
    get: jest.fn(),
    set: jest.fn(),
    delByPattern: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ContractsService(
      asMock<ContractsRepository>(contractsRepository),
      asMock<ClientsRepository>(clientsRepository),
      asMock<JobsRepository>(jobsRepository),
      asMock<EmailService>(emailService),
      asMock<RedisService>(redisService),
      {} as StorageService,
      {} as PdfService,
    );
  });

  it('returns conflict when creating duplicate contract for same job', async () => {
    clientsRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(CLIENT_ID),
    });
    jobsRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(JOB_ID),
      title: 'Pipe Repair',
      timezone: 'UTC',
    });
    contractsRepository.findByJobId.mockResolvedValue({
      _id: new Types.ObjectId(CONTRACT_ID),
    });

    const result = await service.createContract(BUSINESS_ID, {
      clientId: CLIENT_ID,
      jobId: JOB_ID,
      name: 'Agreement',
      amount: 350,
      expiresAt: '2026-06-01',
    });

    expect(result).toBeInstanceOf(ConflictException);
  });

  it('requires signedAt when status changes to signed and no existing signedAt', async () => {
    contractsRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(CONTRACT_ID),
      timezone: 'UTC',
      signedAt: undefined,
    });

    const result = await service.updateContract(CONTRACT_ID, BUSINESS_ID, {
      status: ContractStatus.SIGNED,
    });

    expect(result).toBeInstanceOf(BadRequestException);
  });
});
