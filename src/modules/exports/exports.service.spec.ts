import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';
import { ClientsRepository } from '../clients/clients.repository';
import { JobsRepository } from '../jobs/jobs.repository';
import { ExportsService } from './exports.service';

const BUSINESS_ID = '664abc123456789012345678';
const CLIENT_ID = '664abc000000000000000001';
const bId = new Types.ObjectId(BUSINESS_ID);

const baseClient = {
  _id: new Types.ObjectId(CLIENT_ID),
  businessId: bId,
  name: 'Jane Smith',
  email: 'jane@example.com',
  phone: '+12025550100',
};

describe('ExportsService', () => {
  let service: ExportsService;
  let clientsRepository: { findById: jest.Mock };
  let jobsRepository: { findAll: jest.Mock };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    clientsRepository = { findById: jest.fn() };
    jobsRepository = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };

    service = new ExportsService(
      clientsRepository as unknown as ClientsRepository,
      jobsRepository as unknown as JobsRepository,
    );

    loggerErrorSpy = jest
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  describe('exportClient', () => {
    it('should return NotFoundException when client does not exist', async () => {
      clientsRepository.findById.mockResolvedValue(null);

      const result = await service.exportClient(CLIENT_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        CLIENTS_MESSAGES.ERROR.NOT_FOUND,
      );
    });

    it('should return InternalServerErrorException when Cloudinary credentials are missing', async () => {
      clientsRepository.findById.mockResolvedValue(baseClient);
      // Cloudinary env vars not set in test environment — upload throws
      const result = await service.exportClient(CLIENT_ID, BUSINESS_ID);

      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should fetch jobs for the client before uploading', async () => {
      clientsRepository.findById.mockResolvedValue(baseClient);

      await service.exportClient(CLIENT_ID, BUSINESS_ID);

      expect(jobsRepository.findAll).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        { clientId: CLIENT_ID },
        expect.objectContaining({ limit: 1000 }),
      );
    });
  });
});
