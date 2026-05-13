import { Injectable, NotImplementedException } from '@nestjs/common';
import type {
  IStorageProvider,
  UploadResult,
} from '../interfaces/storage-provider.interface';

@Injectable()
export class S3StorageProvider implements IStorageProvider {
  uploadStream(
    _file: Express.Multer.File,
    _folder: string,
  ): Promise<UploadResult> {
    return Promise.reject(
      new NotImplementedException('S3 storage provider is not yet implemented'),
    );
  }

  uploadBuffer(
    _buffer: Buffer,
    _folder: string,
    _filename: string,
  ): Promise<UploadResult> {
    return Promise.reject(
      new NotImplementedException('S3 storage provider is not yet implemented'),
    );
  }

  delete(_publicId: string): Promise<void> {
    return Promise.reject(
      new NotImplementedException('S3 storage provider is not yet implemented'),
    );
  }
}
