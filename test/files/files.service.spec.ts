import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FILES_MESSAGES } from 'src/common/constants/messages/files.messages';
import { ClientsRepository } from 'src/modules/clients/repositories/clients.repository';
import { FilesRepository } from 'src/modules/files/repositories/files.repository';
import { FilesService } from 'src/modules/files/services/files.service';

const BUSINESS_ID = new Types.ObjectId().toString();
const CLIENT_ID = new Types.ObjectId().toString();

describe('FilesService', () => {
  let service: FilesService;

  const filesRepository = {
    findAllForClient: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    softDelete: jest.fn(),
  };

  const clientsRepository = {
    findById: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FilesService(
      filesRepository as unknown as FilesRepository,
      clientsRepository as unknown as ClientsRepository,
    );
  });

  it('returns 400 FILE_TOO_LARGE when file exceeds 10MB', async () => {
    const file = {
      size: 11 * 1024 * 1024,
      mimetype: 'application/pdf',
      originalname: 'contract.pdf',
      buffer: Buffer.from('x'),
    } as Express.Multer.File;

    const result = await service.uploadClientFile(
      BUSINESS_ID,
      CLIENT_ID,
      new Types.ObjectId().toString(),
      file,
    );

    expect(result).toBeInstanceOf(BadRequestException);
    expect((result as BadRequestException).message).toBe(
      FILES_MESSAGES.ERROR.SIZE_EXCEEDED,
    );
  });

  it('returns 400 for invalid file mime type', async () => {
    const file = {
      size: 1024,
      mimetype: 'text/plain',
      originalname: 'notes.txt',
      buffer: Buffer.from('x'),
    } as Express.Multer.File;

    const result = await service.uploadClientFile(
      BUSINESS_ID,
      CLIENT_ID,
      new Types.ObjectId().toString(),
      file,
    );

    expect(result).toBeInstanceOf(BadRequestException);
    expect((result as BadRequestException).message).toBe(
      FILES_MESSAGES.ERROR.INVALID_TYPE,
    );
  });
});
