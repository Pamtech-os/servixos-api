import { Global, Module } from '@nestjs/common';
import { CloudinaryStorageProvider } from './providers/cloudinary.storage-provider';
import { S3StorageProvider } from './providers/s3.storage-provider';
import { R2StorageProvider } from './providers/r2.storage-provider';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';
import { StorageService } from './storage.service';

const PROVIDER_MAP = {
  cloudinary: CloudinaryStorageProvider,
  s3: S3StorageProvider,
  r2: R2StorageProvider,
} as const;

type ProviderKey = keyof typeof PROVIDER_MAP;

const activeKey = (process.env.STORAGE_PROVIDER ?? 'cloudinary') as ProviderKey;
const ProviderClass = PROVIDER_MAP[activeKey] ?? CloudinaryStorageProvider;

@Global()
@Module({
  providers: [
    { provide: STORAGE_PROVIDER, useClass: ProviderClass },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
