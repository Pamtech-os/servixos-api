import { InternalServerErrorException } from '@nestjs/common';
import type { UploadResult } from 'src/modules/storage/interfaces/storage-provider.interface';
import { StorageService } from 'src/modules/storage/storage.service';

const FAKE_RESULT: UploadResult = {
  url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  publicId: 'servixos/uploads/sample',
};

describe('StorageService', () => {
  let service: StorageService;
  let provider: {
    uploadStream: jest.Mock;
    uploadBuffer: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    provider = {
      uploadStream: jest.fn(),
      uploadBuffer: jest.fn(),
      delete: jest.fn(),
    };

    // StorageService accepts the provider as its first constructor arg at
    // runtime — @Inject is metadata only and does not change the JS signature.
    service = new StorageService(provider);
  });

  describe('uploadStream', () => {
    it('delegates to the provider and returns its result', async () => {
      // Arrange
      const file = { originalname: 'photo.jpg' } as Express.Multer.File;
      provider.uploadStream.mockResolvedValue(FAKE_RESULT);

      // Act
      const result = await service.uploadStream(file, 'servixos/uploads/biz1');

      // Assert
      expect(provider.uploadStream).toHaveBeenCalledWith(
        file,
        'servixos/uploads/biz1',
      );
      expect(result).toEqual(FAKE_RESULT);
    });

    it('propagates provider errors', async () => {
      // Arrange
      const file = { originalname: 'photo.jpg' } as Express.Multer.File;
      provider.uploadStream.mockRejectedValue(
        new InternalServerErrorException('Upload failed'),
      );

      // Act & Assert
      await expect(
        service.uploadStream(file, 'servixos/uploads/biz1'),
      ).rejects.toThrow('Upload failed');
    });
  });

  describe('uploadBuffer', () => {
    it('delegates to the provider and returns its result', async () => {
      // Arrange
      const buffer = Buffer.from('pdf-content');
      provider.uploadBuffer.mockResolvedValue(FAKE_RESULT);

      // Act
      const result = await service.uploadBuffer(
        buffer,
        'servixos/invoices',
        'invoice-001.pdf',
      );

      // Assert
      expect(provider.uploadBuffer).toHaveBeenCalledWith(
        buffer,
        'servixos/invoices',
        'invoice-001.pdf',
      );
      expect(result).toEqual(FAKE_RESULT);
    });

    it('propagates provider errors', async () => {
      // Arrange
      provider.uploadBuffer.mockRejectedValue(new Error('Bucket unavailable'));

      // Act & Assert
      await expect(
        service.uploadBuffer(Buffer.from('x'), 'folder', 'file.pdf'),
      ).rejects.toThrow('Bucket unavailable');
    });
  });

  describe('delete', () => {
    it('delegates to the provider', async () => {
      // Arrange
      provider.delete.mockResolvedValue(undefined);

      // Act
      await service.delete('servixos/uploads/sample');

      // Assert
      expect(provider.delete).toHaveBeenCalledWith('servixos/uploads/sample');
    });

    it('propagates provider errors', async () => {
      // Arrange
      provider.delete.mockRejectedValue(new Error('Delete failed'));

      // Act & Assert
      await expect(service.delete('bad-id')).rejects.toThrow('Delete failed');
    });
  });
});
