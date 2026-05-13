export interface UploadResult {
  url: string;
  publicId: string;
}

export interface IStorageProvider {
  uploadStream(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadResult>;
  uploadBuffer(
    buffer: Buffer,
    folder: string,
    filename: string,
  ): Promise<UploadResult>;
  delete(publicId: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
