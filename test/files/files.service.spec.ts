import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { FILES_MESSAGES } from 'src/common/constants/messages/files.messages';
import type { ClientsRepository } from 'src/modules/clients/repositories/clients.repository';
import type { FilesRepository } from 'src/modules/files/repositories/files.repository';
import { FilesService } from 'src/modules/files/services/files.service';
import type { StorageService } from 'src/modules/storage/storage.service';
import type { ClientFile } from 'src/modules/files/schemas/client-file.schema';
import { FileFormat } from 'src/modules/files/schemas/client-file.schema';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = new Types.ObjectId().toString();
const CLIENT_ID = new Types.ObjectId().toString();
const FILE_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

const makeFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File =>
  ({
    size: 1024,
    mimetype: 'application/pdf',
    originalname: 'contract.pdf',
    buffer: Buffer.from('x'),
    ...overrides,
  }) as Express.Multer.File;

describe('FilesService', () => {
  let service: FilesService;
  let loggerErrorSpy: jest.SpyInstance;

  const filesRepository = {
    findAllForClient: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    softDelete: jest.fn(),
  };

  const clientsRepository = {
    findById: jest.fn(),
  };

  const storageService = {
    uploadStream: jest.fn(),
    uploadBuffer: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FilesService(
      asMock<FilesRepository>(filesRepository),
      asMock<ClientsRepository>(clientsRepository),
      asMock<StorageService>(storageService),
    );
    loggerErrorSpy = jest
      .spyOn(Reflect.get(service, 'logger') as Logger, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  // ─── uploadFile ─────────────────────────────────────────────────────────────

  describe('uploadFile', () => {
    it('returns 400 when no file is provided', async () => {
      // Arrange — no file

      // Act
      const result = await service.uploadFile(BUSINESS_ID, undefined);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
    });

    it('returns 400 FILE_TOO_LARGE when file exceeds 10 MB', async () => {
      // Arrange
      const file = makeFile({ size: 11 * 1024 * 1024 });

      // Act
      const result = await service.uploadFile(BUSINESS_ID, file);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
      expect((result as BadRequestException).message).toBe(
        FILES_MESSAGES.ERROR.SIZE_EXCEEDED,
      );
    });

    it('returns 400 for an unsupported MIME type', async () => {
      // Arrange
      const file = makeFile({
        mimetype: 'text/plain',
        originalname: 'notes.txt',
      });

      // Act
      const result = await service.uploadFile(BUSINESS_ID, file);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
      expect((result as BadRequestException).message).toBe(
        FILES_MESSAGES.ERROR.INVALID_TYPE,
      );
    });

    it('returns upload metadata on success', async () => {
      // Arrange
      const file = makeFile();
      storageService.uploadStream.mockResolvedValue({
        url: 'https://cdn.example.com/file.pdf',
        publicId: 'servixos/uploads/biz/file',
      });

      // Act
      const result = await service.uploadFile(BUSINESS_ID, file);

      // Assert
      expect(storageService.uploadStream).toHaveBeenCalledWith(
        file,
        `servixos/uploads/${BUSINESS_ID}`,
      );
      expect(result).toEqual({
        url: 'https://cdn.example.com/file.pdf',
        publicId: 'servixos/uploads/biz/file',
        filename: 'contract.pdf',
        mimeType: 'application/pdf',
        filesizeBytes: 1024,
      });
    });

    it('returns InternalServerErrorException when storage throws', async () => {
      // Arrange
      const file = makeFile();
      storageService.uploadStream.mockRejectedValue(new Error('Storage down'));

      // Act
      const result = await service.uploadFile(BUSINESS_ID, file);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  // ─── attachClientFile ────────────────────────────────────────────────────────

  describe('attachClientFile', () => {
    const input = {
      url: 'https://cdn.example.com/file.pdf',
      publicId: 'servixos/client-files/biz/client/file',
      filename: 'contract.pdf',
      mimeType: 'application/pdf',
      filesizeBytes: 2048,
    };

    it('returns 400 for an unsupported MIME type', async () => {
      // Arrange
      const badInput = { ...input, mimeType: 'text/html' };

      // Act
      const result = await service.attachClientFile(
        BUSINESS_ID,
        CLIENT_ID,
        USER_ID,
        badInput,
      );

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
      expect((result as BadRequestException).message).toBe(
        FILES_MESSAGES.ERROR.INVALID_TYPE,
      );
    });

    it('returns NotFoundException when client does not exist', async () => {
      // Arrange
      clientsRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.attachClientFile(
        BUSINESS_ID,
        CLIENT_ID,
        USER_ID,
        input,
      );

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('creates and returns the file record on success', async () => {
      // Arrange
      const clientObjId = new Types.ObjectId(CLIENT_ID);
      const createdFile: ClientFile = {
        _id: new Types.ObjectId(FILE_ID),
        businessId: new Types.ObjectId(BUSINESS_ID),
        clientId: clientObjId,
        filename: input.filename,
        cloudinaryPublicId: input.publicId,
        url: input.url,
        format: FileFormat.PDF,
        filesizeBytes: input.filesizeBytes,
      };
      clientsRepository.findById.mockResolvedValue({ _id: clientObjId });
      filesRepository.create.mockResolvedValue(createdFile);

      // Act
      const result = await service.attachClientFile(
        BUSINESS_ID,
        CLIENT_ID,
        USER_ID,
        input,
      );

      // Assert
      expect(filesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: input.filename,
          url: input.url,
          cloudinaryPublicId: input.publicId,
          filesizeBytes: input.filesizeBytes,
        }),
      );
      // cloudinaryPublicId is stripped from the returned object
      expect(result).not.toHaveProperty('cloudinaryPublicId');
    });
  });

  // ─── deleteFile ──────────────────────────────────────────────────────────────

  describe('deleteFile', () => {
    const makeDeletedFile = (): ClientFile => ({
      _id: new Types.ObjectId(FILE_ID),
      businessId: new Types.ObjectId(BUSINESS_ID),
      clientId: new Types.ObjectId(CLIENT_ID),
      filename: 'contract.pdf',
      cloudinaryPublicId: 'servixos/client-files/biz/client/file',
      url: 'https://cdn.example.com/file.pdf',
      format: FileFormat.PDF,
      filesizeBytes: 1024,
    });

    it('returns NotFoundException when the file does not exist', async () => {
      // Arrange
      filesRepository.softDelete.mockResolvedValue(null);

      // Act
      const result = await service.deleteFile(FILE_ID, BUSINESS_ID);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('soft-deletes and triggers storage deletion on success', async () => {
      // Arrange
      const deletedFile = makeDeletedFile();
      filesRepository.softDelete.mockResolvedValue(deletedFile);
      storageService.delete.mockResolvedValue(undefined);

      // Act
      const result = await service.deleteFile(FILE_ID, BUSINESS_ID);

      // Assert
      expect(result).toBeNull();
      expect(storageService.delete).toHaveBeenCalledWith(
        deletedFile.cloudinaryPublicId,
      );
    });

    it('still returns null when storage deletion fails (fire-and-forget)', async () => {
      // Arrange
      filesRepository.softDelete.mockResolvedValue(makeDeletedFile());
      storageService.delete.mockRejectedValue(new Error('CDN unavailable'));

      // Act
      const result = await service.deleteFile(FILE_ID, BUSINESS_ID);

      // Assert — soft-delete succeeded regardless of CDN failure
      expect(result).toBeNull();
    });
  });
});
