import {
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { ClientsRepository } from 'src/modules/clients/repositories/clients.repository';
import { ClientsService } from 'src/modules/clients/services/clients.service';
import { Client } from 'src/modules/clients/schemas/client.schema';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = '664abc123456789012345678';
const CLIENT_ID = '664abc000000000000000001';
const bId = new Types.ObjectId(BUSINESS_ID);

const baseClient: Client = {
  _id: new Types.ObjectId(CLIENT_ID),
  businessId: bId,
  name: 'Jane Smith',
  email: 'jane@example.com',
  phone: '+12025550100',
};

const baseBusiness = {
  _id: new Types.ObjectId(BUSINESS_ID),
  name: 'Acme Services',
  timezone: 'America/New_York',
  deletedAt: undefined,
};

describe('ClientsService', () => {
  let service: ClientsService;
  let clientsRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByEmail: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
    softDelete: jest.Mock;
  };
  let usersRepository: {
    findByEmail: jest.Mock;
    create: jest.Mock;
  };
  let businessRepository: {
    findById: jest.Mock;
  };
  let redisService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    incr: jest.Mock;
  };
  let agendaService: {
    now: jest.Mock;
  };
  let mockConnection: {
    startSession: jest.Mock;
  };
  let mockSession: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };
    clientsRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
      softDelete: jest.fn(),
    };
    usersRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    };
    businessRepository = {
      findById: jest.fn().mockResolvedValue(baseBusiness),
    };
    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(1),
    };
    agendaService = {
      now: jest.fn().mockResolvedValue(undefined),
    };

    service = new ClientsService(
      mockConnection as never,
      asMock<ClientsRepository>(clientsRepository),
      asMock<UsersRepository>(usersRepository),
      asMock<BusinessRepository>(businessRepository),
      asMock<AgendaService>(agendaService),
      asMock<RedisService>(redisService),
    );

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  // ─── listClients ────────────────────────────────────────────────────────────

  describe('listClients', () => {
    it('should return cached result when cache hit', async () => {
      const cached = {
        data: [baseClient],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      redisService.get
        .mockResolvedValueOnce('1') // version key
        .mockResolvedValueOnce(JSON.stringify(cached)); // list cache key

      const result = await service.listClients(BUSINESS_ID, {
        page: 1,
        limit: 10,
      });

      // After JSON.parse, ObjectIds become strings — compare serialized form
      expect(JSON.stringify(result)).toEqual(JSON.stringify(cached));
      expect(clientsRepository.findAll).not.toHaveBeenCalled();
    });

    it('should query repository and cache result when cache misses', async () => {
      clientsRepository.findAll.mockResolvedValue({
        data: [baseClient],
        total: 1,
      });

      const result = await service.listClients(BUSINESS_ID, {
        page: 1,
        limit: 10,
      });

      expect(clientsRepository.findAll).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalled();
      expect(result).not.toBeInstanceOf(InternalServerErrorException);
      const paginated = result as { data: Client[]; meta: unknown };
      expect(paginated.data).toHaveLength(1);
    });

    it('should return InternalServerErrorException when repository throws', async () => {
      clientsRepository.findAll.mockRejectedValue(new Error('db error'));

      const result = await service.listClients(BUSINESS_ID, {});

      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── getClient ──────────────────────────────────────────────────────────────

  describe('getClient', () => {
    it('should return client from cache when cache hit', async () => {
      redisService.get.mockResolvedValueOnce(JSON.stringify(baseClient));

      const result = await service.getClient(CLIENT_ID, BUSINESS_ID);

      expect(clientsRepository.findById).not.toHaveBeenCalled();
      // After JSON.parse, ObjectIds become strings — compare by stable field
      expect((result as Client).email).toBe(baseClient.email);
    });

    it('should return client from repository when cache misses', async () => {
      clientsRepository.findById.mockResolvedValue(baseClient);

      const result = await service.getClient(CLIENT_ID, BUSINESS_ID);

      expect(clientsRepository.findById).toHaveBeenCalledWith(
        CLIENT_ID,
        expect.any(Types.ObjectId),
      );
      expect(result).toEqual(baseClient);
    });

    it('should return NotFoundException when client does not exist', async () => {
      clientsRepository.findById.mockResolvedValue(null);

      const result = await service.getClient(CLIENT_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        CLIENTS_MESSAGES.ERROR.NOT_FOUND,
      );
    });

    it('should return InternalServerErrorException when repository throws', async () => {
      clientsRepository.findById.mockRejectedValue(new Error('db error'));

      const result = await service.getClient(CLIENT_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── createClient ───────────────────────────────────────────────────────────

  describe('createClient', () => {
    const dto = {
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '+12025550100',
    };

    it('should create client and provision user when email is new', async () => {
      clientsRepository.findByEmail.mockResolvedValue(null);
      usersRepository.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        email: dto.email,
      });
      clientsRepository.create.mockResolvedValue(baseClient);

      const result = await service.createClient(BUSINESS_ID, dto);

      expect(clientsRepository.create).toHaveBeenCalledTimes(1);
      expect(agendaService.now).toHaveBeenCalledTimes(1);
      expect(result).toEqual(baseClient);
    });

    it('should create client without sending email when user already exists', async () => {
      clientsRepository.findByEmail.mockResolvedValue(null);
      usersRepository.findByEmail.mockResolvedValue({
        _id: new Types.ObjectId(),
        email: dto.email,
      });
      clientsRepository.create.mockResolvedValue(baseClient);

      const result = await service.createClient(BUSINESS_ID, dto);

      expect(agendaService.now).not.toHaveBeenCalled();
      expect(result).toEqual(baseClient);
    });

    it('should return ConflictException when email is already taken in the business', async () => {
      clientsRepository.findByEmail.mockResolvedValue(baseClient);

      const result = await service.createClient(BUSINESS_ID, dto);

      expect(result).toBeInstanceOf(ConflictException);
      expect(clientsRepository.create).not.toHaveBeenCalled();
    });

    it('should return NotFoundException when business does not exist', async () => {
      businessRepository.findById.mockResolvedValue(null);
      clientsRepository.findByEmail.mockResolvedValue(null);

      const result = await service.createClient(BUSINESS_ID, dto);

      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        COMMON_MESSAGES.ERROR.NOT_FOUND,
      );
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      clientsRepository.findByEmail.mockRejectedValue(new Error('db crash'));

      const result = await service.createClient(BUSINESS_ID, dto);

      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });
  });

  // ─── updateClient ───────────────────────────────────────────────────────────

  describe('updateClient', () => {
    it('should update client and invalidate caches', async () => {
      const updated = { ...baseClient, name: 'Jane Updated' };
      clientsRepository.findByEmail.mockResolvedValue(null);
      clientsRepository.updateById.mockResolvedValue(updated);

      const result = await service.updateClient(CLIENT_ID, BUSINESS_ID, {
        name: 'Jane Updated',
      });

      expect(clientsRepository.updateById).toHaveBeenCalledTimes(1);
      expect(redisService.incr).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('should return NotFoundException when client does not exist', async () => {
      clientsRepository.findByEmail.mockResolvedValue(null);
      clientsRepository.updateById.mockResolvedValue(null);

      const result = await service.updateClient(CLIENT_ID, BUSINESS_ID, {
        name: 'Ghost',
      });

      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should return ConflictException when updating email to one already taken by another client', async () => {
      const otherClient = { ...baseClient, _id: new Types.ObjectId() };
      clientsRepository.findByEmail.mockResolvedValue(otherClient);

      const result = await service.updateClient(CLIENT_ID, BUSINESS_ID, {
        email: 'taken@example.com',
      });

      expect(result).toBeInstanceOf(ConflictException);
    });
  });

  // ─── deleteClient ───────────────────────────────────────────────────────────

  describe('deleteClient', () => {
    it('should soft-delete client and invalidate caches', async () => {
      // Arrange
      clientsRepository.softDelete.mockResolvedValue(baseClient);

      // Act
      const result = await service.deleteClient(CLIENT_ID, BUSINESS_ID);

      // Assert
      expect(clientsRepository.softDelete).toHaveBeenCalledWith(
        CLIENT_ID,
        expect.any(Types.ObjectId),
      );
      expect(redisService.incr).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should queue CLIENT_REQUESTS_CLEANUP job with deleted client id and email', async () => {
      // Arrange
      clientsRepository.softDelete.mockResolvedValue(baseClient);

      // Act
      await service.deleteClient(CLIENT_ID, BUSINESS_ID);

      // Assert — fire-and-forget job queued with correct identifiers
      expect(agendaService.now).toHaveBeenCalledWith(
        'client:requests:cleanup',
        {
          businessId: BUSINESS_ID,
          clientId: baseClient._id.toString(),
          clientEmail: baseClient.email,
        },
      );
    });

    it('should not queue cleanup job when client is not found', async () => {
      // Arrange
      clientsRepository.softDelete.mockResolvedValue(null);

      // Act
      await service.deleteClient(CLIENT_ID, BUSINESS_ID);

      // Assert
      expect(agendaService.now).not.toHaveBeenCalled();
    });

    it('should return NotFoundException when client does not exist', async () => {
      // Arrange
      clientsRepository.softDelete.mockResolvedValue(null);

      // Act
      const result = await service.deleteClient(CLIENT_ID, BUSINESS_ID);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('should return InternalServerErrorException on unexpected error', async () => {
      // Arrange
      clientsRepository.softDelete.mockRejectedValue(new Error('db error'));

      // Act
      const result = await service.deleteClient(CLIENT_ID, BUSINESS_ID);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });
});
