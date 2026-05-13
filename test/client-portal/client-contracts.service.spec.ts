import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { ContractsRepository } from 'src/modules/contracts/repositories/contracts.repository';
import { JobsRepository } from 'src/modules/jobs/repositories/jobs.repository';
import { ContractStatus } from 'src/modules/contracts/schemas/contract.schema';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { ClientContractsService } from 'src/modules/client-portal/services/client-contracts.service';
import {
  ClientContractSortBy,
  ListClientContractsDto,
} from 'src/modules/client-portal/dto/list-client-contracts.dto';
import { SortOrder } from 'src/modules/client-portal/dto/list-client-invoices.dto';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = new Types.ObjectId().toString();
const CLIENT_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();
const CONTRACT_ID = new Types.ObjectId().toString();

describe('ClientContractsService', () => {
  let service: ClientContractsService;

  let contractsRepository: {
    findByIdForClient: jest.Mock;
    signContractForClient: jest.Mock;
    findAllForClient: jest.Mock;
    findAllForClientSortedByJobAmount: jest.Mock;
  };
  let jobsRepository: {
    findByIds: jest.Mock;
  };
  let businessRepository: {
    findById: jest.Mock;
  };
  let redisService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    delByPattern: jest.Mock;
  };
  let agendaService: {
    now: jest.Mock;
  };

  beforeEach(() => {
    contractsRepository = {
      findByIdForClient: jest.fn(),
      signContractForClient: jest.fn(),
      findAllForClient: jest.fn(),
      findAllForClientSortedByJobAmount: jest.fn(),
    };
    jobsRepository = {
      findByIds: jest.fn(),
    };
    businessRepository = {
      findById: jest.fn(),
    };
    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(0),
    };
    agendaService = {
      now: jest.fn().mockResolvedValue(undefined),
    };

    const config = {
      get: jest.fn().mockReturnValue('USD'),
    };

    service = new ClientContractsService(
      asMock<ConfigService>(config),
      asMock<ContractsRepository>(contractsRepository),
      asMock<JobsRepository>(jobsRepository),
      asMock<BusinessRepository>(businessRepository),
      asMock<RedisService>(redisService),
      asMock<AgendaService>(agendaService),
    );
  });

  it('returns conflict when contract is already signed', async () => {
    contractsRepository.findByIdForClient.mockResolvedValue({
      _id: new Types.ObjectId(CONTRACT_ID),
      status: ContractStatus.SIGNED,
    });

    const result = await service.signContract(
      BUSINESS_ID,
      CLIENT_ID,
      USER_ID,
      CONTRACT_ID,
    );

    expect(result).toBeInstanceOf(ConflictException);
    expect(contractsRepository.signContractForClient).not.toHaveBeenCalled();
  });

  it('signs sent contract and invalidates client caches', async () => {
    const signedAt = new Date('2026-05-08T12:00:00.000Z');

    contractsRepository.findByIdForClient.mockResolvedValue({
      _id: new Types.ObjectId(CONTRACT_ID),
      status: ContractStatus.SENT,
    });
    businessRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(BUSINESS_ID),
      timezone: 'UTC',
    });
    contractsRepository.signContractForClient.mockResolvedValue({
      _id: new Types.ObjectId(CONTRACT_ID),
      status: ContractStatus.SIGNED,
      signedAt,
    });

    const result = await service.signContract(
      BUSINESS_ID,
      CLIENT_ID,
      USER_ID,
      CONTRACT_ID,
    );

    expect(result).not.toBeInstanceOf(ConflictException);
    expect(result).not.toBeInstanceOf(NotFoundException);
    expect(result).not.toBeInstanceOf(InternalServerErrorException);

    const data = result as { id: string; status: string; signedAt: string };
    expect(data.id).toBe(CONTRACT_ID);
    expect(data.status).toBe('signed');

    expect(redisService.del).toHaveBeenCalledTimes(2);
    expect(redisService.delByPattern).toHaveBeenCalledTimes(2);
    expect(agendaService.now).toHaveBeenCalledTimes(1);
  });

  it('uses repository amount sorting path for amount sort queries', async () => {
    const contractId = new Types.ObjectId();
    const jobId = new Types.ObjectId();
    const dto: ListClientContractsDto = {
      page: 1,
      limit: 10,
      sort: ClientContractSortBy.AMOUNT,
      order: SortOrder.ASC,
    };

    contractsRepository.findAllForClientSortedByJobAmount.mockResolvedValue({
      data: [
        {
          _id: contractId,
          jobId,
          title: 'Design Contract',
          status: ContractStatus.SENT,
          sentAt: new Date('2026-05-01T00:00:00.000Z'),
        },
      ],
      total: 1,
    });
    jobsRepository.findByIds.mockResolvedValue([
      {
        _id: jobId,
        price: 5000,
      },
    ]);

    const result = await service.listContracts(BUSINESS_ID, CLIENT_ID, dto);

    expect(result).not.toBeInstanceOf(InternalServerErrorException);
    expect(
      contractsRepository.findAllForClientSortedByJobAmount,
    ).toHaveBeenCalledTimes(1);
    expect(contractsRepository.findAllForClient).not.toHaveBeenCalled();

    const payload = result as {
      data: Array<{ amount: number; currency: string }>;
      meta: { total: number };
    };
    expect(payload.meta.total).toBe(1);
    expect(payload.data[0].amount).toBe(500000);
    expect(payload.data[0].currency).toBe('USD');
  });
});
