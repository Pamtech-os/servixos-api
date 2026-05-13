import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import type {
  IStorageProvider,
  UploadResult,
} from '../interfaces/storage-provider.interface';

@Injectable()
export class CloudinaryStorageProvider implements IStorageProvider {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadStream(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          use_filename: true,
          unique_filename: true,
        },
        (error, result) => {
          if (error || !result) {
            return reject(new Error(error?.message ?? 'Upload failed'));
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      Readable.from(file.buffer).pipe(stream);
    });
  }

  async uploadBuffer(
    buffer: Buffer,
    folder: string,
    filename: string,
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'raw',
          public_id: filename.replace(/\.[^/.]+$/, ''),
          unique_filename: true,
        },
        (error, result) => {
          if (error || !result) {
            return reject(new Error(error?.message ?? 'Upload failed'));
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      Readable.from(buffer).pipe(stream);
    });
  }

  async delete(publicId: string): Promise<void> {
    // Try raw first (PDFs, docs), fall back to image type for photos
    const raw = (await cloudinary.uploader.destroy(publicId, {
      resource_type: 'raw',
    })) as { result: string };
    if (raw.result === 'not found') {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    }
  }
}
