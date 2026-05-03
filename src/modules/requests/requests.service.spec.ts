import { JOBS } from '../agenda/agenda.constants';
import { AgendaService } from '../agenda/agenda.service';
import { BusinessRepository } from '../business/business.repository';
import { ClientsRepository } from '../clients/clients.repository';
import { RedisService } from '../redis/redis.service';
import { UsersRepository } from '../users/users.repository';
import { RequestsRepository } from './requests.repository';
import { ClientProvisioningJobData, RequestsService } from './requests.service';

describe('RequestsService', () => {
  let service: RequestsService;
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

  beforeEach(() => {
    agendaService = {
      define: jest.fn(),
      now: jest.fn(),
      schedule: jest.fn().mockResolvedValue(undefined),
      every: jest.fn(),
    };

    service = new RequestsService(
      {} as RequestsRepository,
      {} as ClientsRepository,
      {} as BusinessRepository,
      {} as UsersRepository,
      agendaService as unknown as AgendaService,
      {} as RedisService,
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
});
