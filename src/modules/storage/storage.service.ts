import { Inject, Injectable } from '@nestjs/common';
import type {
  IStorageProvider,
  UploadResult,
} from './interfaces/storage-provider.interface';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: IStorageProvider,
  ) {}

  /** Uploads a multipart file stream to the given folder. */
  uploadStream(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadResult> {
    return this.provider.uploadStream(file, folder);
  }

  /** Uploads an in-memory buffer (e.g. a generated PDF) to the given folder. */
  uploadBuffer(
    buffer: Buffer,
    folder: string,
    filename: string,
  ): Promise<UploadResult> {
    return this.provider.uploadBuffer(buffer, folder, filename);
  }

  /** Deletes a stored asset by its provider-specific public ID. */
  delete(publicId: string): Promise<void> {
    return this.provider.delete(publicId);
  }
}
