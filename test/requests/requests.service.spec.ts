import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { REQUESTS_MESSAGES } from 'src/common/constants/messages/requests.messages';
import { JOBS } from 'src/modules/agenda/agenda.constants';
import { AgendaService } from 'src/modules/agenda/agenda.service';
import { BusinessRepository } from 'src/modules/business/business.repository';
import { ClientsRepository } from 'src/modules/clients/clients.repository';
import { RedisService } from 'src/modules/redis/redis.service';
import { RequestsRepository } from 'src/modules/requests/requests.repository';
import {
  ClientProvisioningJobData,
  RequestsService,
} from 'src/modules/requests/requests.service';
import {
  RequestStatus,
  ServiceRequest,
} from 'src/modules/requests/schemas/service-request.schema';
import { UsersRepository } from 'src/modules/users/users.repository';

describe('RequestsService', () => {
  let service: RequestsService;
  let requestsRepository: {
    findById: jest.Mock;
    updateById: jest.Mock;
  };
  let clientsRepository: {
    findByEmail: jest.Mock;
  };
  let businessRepository: {
    findById: jest.Mock;
  };
  let redisService: {
    incr: jest.Mock;
  };
  let agendaService: {
    define: jest.Mock;
    now: jest.Mock;
    schedule: jest.Mock;
    every: jest.Mock;
  };
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  const payload: ClientProvisioningJobData = {
    businessId: '664abc123456789012345678',
    businessName: 'Acme Services',
    clientName: 'Jane Client',
    clientEmail: 'jane@example.com',
    clientPhone: '+12025550123',
    attempt: 0,
  };
  const businessObjectId = new Types.ObjectId(payload.businessId);
  const baseRequest: ServiceRequest = {
    _id: new Types.ObjectId(),
    businessId: businessObjectId,
    clientName: payload.clientName,
    clientEmail: payload.clientEmail,
    clientPhone: payload.clientPhone,
    service: 'Cleaning service',
    requestedDate: new Date('2026-05-20T10:00:00.000Z'),
    message: 'Please deep clean my office',
    status: RequestStatus.PENDING,
  };

  beforeEach(() => {
    requestsRepository = {
      findById: jest.fn(),
      updateById: jest.fn(),
    };
    clientsRepository = {
      findByEmail: jest.fn(),
    };
    businessRepository = {
      findById: jest.fn(),
    };
    redisService = {
      incr: jest.fn().mockResolvedValue(1),
    };
    agendaService = {
      define: jest.fn(),
      now: jest.fn(),
      schedule: jest.fn().mockResolvedValue(undefined),
      every: jest.fn(),
    };

    const config = {
      get: jest.fn().mockReturnValue(undefined),
    };

    service = new RequestsService(
      config as unknown as ConfigService,
      requestsRepository as unknown as RequestsRepository,
      clientsRepository as unknown as ClientsRepository,
      businessRepository as unknown as BusinessRepository,
      {} as UsersRepository,
      agendaService as unknown as AgendaService,
      redisService as unknown as RedisService,
      {} as never,
    );

    loggerWarnSpy = jest
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    loggerErrorSpy = jest
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);
  });

  const provisionClientSpy = () =>
    jest.spyOn(
      service as unknown as { provisionClient: () => Promise<void> },
      'provisionClient',
    );

  describe('handleClientProvisioningJob', () => {
    it('does not schedule a retry when provisioning succeeds', async () => {
      provisionClientSpy().mockResolvedValue(undefined);

      await service.handleClientProvisioningJob(payload);

      expect(agendaService.schedule).not.toHaveBeenCalled();
    });

    it('schedules retry attempt 1 with 5s delay on first failure', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      provisionClientSpy().mockRejectedValue(new Error('boom'));

      await service.handleClientProvisioningJob(payload);

      expect(agendaService.schedule).toHaveBeenCalledTimes(1);
      const [when, jobName, data] = agendaService.schedule.mock.calls[0] as [
        Date,
        string,
        ClientProvisioningJobData,
      ];
      expect(jobName).toBe(JOBS.REQUEST_CLIENT_PROVISION);
      expect(when.getTime()).toBe(1_005_000);
      expect(data).toMatchObject({ ...payload, attempt: 1 });
      nowSpy.mockRestore();
    });

    it('schedules retry attempt 4 with 40s delay for attempt 3 failure', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(2_000_000);
      provisionClientSpy().mockRejectedValue(new Error('boom'));

      await service.handleClientProvisioningJob({
        ...payload,
        attempt: 3,
      });

      expect(agendaService.schedule).toHaveBeenCalledTimes(1);
      const [when, , data] = agendaService.schedule.mock.calls[0] as [
        Date,
        string,
        ClientProvisioningJobData,
      ];
      expect(when.getTime()).toBe(2_040_000);
      expect(data.attempt).toBe(4);
      nowSpy.mockRestore();
    });

    it('does not schedule a retry when max attempts are exhausted', async () => {
      provisionClientSpy().mockRejectedValue(new Error('boom'));

      await service.handleClientProvisioningJob({
        ...payload,
        attempt: 4,
      });

      expect(agendaService.schedule).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores invalid payloads', async () => {
      const provisionSpy = provisionClientSpy();

      await service.handleClientProvisioningJob({
        ...payload,
        businessId: '',
      });

      expect(provisionSpy).not.toHaveBeenCalled();
      expect(agendaService.schedule).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateRequest', () => {
    it('returns 400 when acceptance details are missing for accepted status', async () => {
      requestsRepository.findById.mockResolvedValue(baseRequest);

      const result = await service.updateRequest(
        baseRequest._id.toString(),
        payload.businessId,
        { status: RequestStatus.ACCEPTED },
        new Types.ObjectId().toString(),
      );

      expect(result).toBeInstanceOf(BadRequestException);
      expect((result as BadRequestException).message).toBe(
        REQUESTS_MESSAGES.ERROR.ACCEPTANCE_DETAILS_REQUIRED,
      );
      expect(clientsRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('returns 400 when acceptance endDate is before startDate', async () => {
      requestsRepository.findById.mockResolvedValue(baseRequest);

      const result = await service.updateRequest(
        baseRequest._id.toString(),
        payload.businessId,
        {
          status: RequestStatus.ACCEPTED,
          quotedPrice: 300,
          startDate: '2026-05-10T09:00:00.000Z',
          endDate: '2026-05-09T09:00:00.000Z',
        },
        new Types.ObjectId().toString(),
      );

      expect(result).toBeInstanceOf(BadRequestException);
      expect((result as BadRequestException).message).toBe(
        REQUESTS_MESSAGES.ERROR.ACCEPTANCE_DATE_RANGE_INVALID,
      );
      expect(clientsRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('stores startDate, endDate, and quotedPrice when accepting a request', async () => {
      const clientId = new Types.ObjectId();
      requestsRepository.findById.mockResolvedValue(baseRequest);
      clientsRepository.findByEmail.mockResolvedValue({ _id: clientId });
      requestsRepository.updateById.mockResolvedValue({
        ...baseRequest,
        status: RequestStatus.ACCEPTED,
      });

      await service.updateRequest(
        baseRequest._id.toString(),
        payload.businessId,
        {
          status: RequestStatus.ACCEPTED,
          quotedPrice: 450,
          startDate: '2026-05-11T09:00:00.000Z',
          endDate: '2026-05-15T17:00:00.000Z',
        },
        new Types.ObjectId().toString(),
      );

      expect(requestsRepository.updateById).toHaveBeenCalledWith(
        baseRequest._id.toString(),
        expect.any(Types.ObjectId),
        expect.any(Object),
      );
      const updateCalls = requestsRepository.updateById.mock.calls as Array<
        [string, Types.ObjectId, Partial<ServiceRequest>]
      >;
      const updatePayload = updateCalls[0]?.[2];
      expect(updatePayload?.status).toBe(RequestStatus.ACCEPTED);
      expect(updatePayload?.quotedPrice).toBe(450);
      expect(updatePayload?.clientId).toEqual(clientId);
      expect(updatePayload?.startDate).toBeInstanceOf(Date);
      expect(updatePayload?.endDate).toBeInstanceOf(Date);
    });
  });

  describe('estimateRequestPrice', () => {
    it('returns cached estimate and skips AI call when estimate already exists', async () => {
      const cachedEstimate = {
        suggestedPrice: 500,
        lowPrice: 420,
        highPrice: 580,
        confidence: 'medium' as const,
        currency: 'USD',
        reasoning: 'Cached estimate for this request.',
      };
      requestsRepository.findById.mockResolvedValue({
        ...baseRequest,
        aiPriceEstimate: cachedEstimate,
        hasAiPriceEstimate: true,
      });
      const generateSpy = jest.spyOn(
        service as unknown as {
          generateAiPriceEstimate: () => Promise<unknown>;
        },
        'generateAiPriceEstimate',
      );

      const result = await service.estimateRequestPrice(
        baseRequest._id.toString(),
        payload.businessId,
      );

      expect(result).toEqual(cachedEstimate);
      expect(generateSpy).not.toHaveBeenCalled();
    });

    it('returns 404 when the request does not exist', async () => {
      requestsRepository.findById.mockResolvedValue(null);

      const result = await service.estimateRequestPrice(
        baseRequest._id.toString(),
        payload.businessId,
      );

      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        REQUESTS_MESSAGES.ERROR.NOT_FOUND,
      );
    });

    it('returns 500 when AI estimation is unavailable', async () => {
      requestsRepository.findById.mockResolvedValue(baseRequest);
      businessRepository.findById.mockResolvedValue({
        _id: businessObjectId,
        name: payload.businessName,
        categoryName: 'Cleaning',
      });
      jest
        .spyOn(
          service as unknown as {
            generateAiPriceEstimate: () => Promise<null>;
          },
          'generateAiPriceEstimate',
        )
        .mockResolvedValue(null);

      const result = await service.estimateRequestPrice(
        baseRequest._id.toString(),
        payload.businessId,
      );

      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect((result as InternalServerErrorException).message).toBe(
        AI_MESSAGES.ERROR.AI_UNAVAILABLE,
      );
    });

    it('returns AI price estimate data when available', async () => {
      const estimate = {
        suggestedPrice: 520,
        lowPrice: 450,
        highPrice: 600,
        confidence: 'high' as const,
        currency: 'USD',
        reasoning: 'Based on local market rates and request scope.',
      };
      requestsRepository.findById.mockResolvedValue(baseRequest);
      businessRepository.findById.mockResolvedValue({
        _id: businessObjectId,
        name: payload.businessName,
        categoryName: 'Cleaning',
      });
      jest
        .spyOn(
          service as unknown as {
            generateAiPriceEstimate: () => Promise<typeof estimate>;
          },
          'generateAiPriceEstimate',
        )
        .mockResolvedValue(estimate);

      const result = await service.estimateRequestPrice(
        baseRequest._id.toString(),
        payload.businessId,
      );

      expect(result).toEqual(estimate);
    });

    it('returns 500 when estimate flow throws unexpectedly', async () => {
      requestsRepository.findById.mockRejectedValue(new Error('db error'));

      const result = await service.estimateRequestPrice(
        baseRequest._id.toString(),
        payload.businessId,
      );

      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect((result as InternalServerErrorException).message).toBe(
        COMMON_MESSAGES.ERROR.INTERNAL,
      );
    });
  });
});
