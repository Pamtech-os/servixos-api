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

  const storageService = {
    delete: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ContractsService(
      asMock<ContractsRepository>(contractsRepository),
      asMock<ClientsRepository>(clientsRepository),
      asMock<JobsRepository>(jobsRepository),
      asMock<EmailService>(emailService),
      asMock<RedisService>(redisService),
      asMock<StorageService>(storageService),
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

  it('clears the cached pdf and destroys its cloudinary asset when html is edited', async () => {
    // Arrange
    contractsRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(CONTRACT_ID),
      timezone: 'UTC',
      html: '<html>old</html>',
      pdfUrl: 'https://cdn.example.com/old.pdf',
      cloudinaryPublicId: 'contracts/old-public-id',
    });
    contractsRepository.updateById.mockResolvedValue({
      _id: new Types.ObjectId(CONTRACT_ID),
      html: '<html>new</html>',
      pdfUrl: '',
      cloudinaryPublicId: '',
    });

    // Act
    await service.updateContract(CONTRACT_ID, BUSINESS_ID, {
      html: '<html>new</html>',
    });

    // Assert
    expect(contractsRepository.updateById).toHaveBeenCalledWith(
      CONTRACT_ID,
      expect.any(Types.ObjectId),
      expect.objectContaining({
        html: '<html>new</html>',
        pdfUrl: '',
        cloudinaryPublicId: '',
      }),
    );
    expect(storageService.delete).toHaveBeenCalledWith(
      'contracts/old-public-id',
    );
  });

  it('leaves the cached pdf untouched when html is not part of the update', async () => {
    // Arrange
    contractsRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(CONTRACT_ID),
      timezone: 'UTC',
      html: '<html>unchanged</html>',
      pdfUrl: 'https://cdn.example.com/unchanged.pdf',
      cloudinaryPublicId: 'contracts/unchanged-public-id',
      signedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    contractsRepository.updateById.mockResolvedValue({
      _id: new Types.ObjectId(CONTRACT_ID),
      status: ContractStatus.SIGNED,
    });

    // Act
    await service.updateContract(CONTRACT_ID, BUSINESS_ID, {
      status: ContractStatus.SIGNED,
    });

    // Assert
    const [, , updateArg] = contractsRepository.updateById.mock.calls[0] as [
      string,
      Types.ObjectId,
      Record<string, unknown>,
    ];
    expect(updateArg).toEqual(
      expect.objectContaining({ status: ContractStatus.SIGNED }),
    );
    expect(Object.keys(updateArg)).not.toContain('pdfUrl');
    expect(storageService.delete).not.toHaveBeenCalled();
  });
});
