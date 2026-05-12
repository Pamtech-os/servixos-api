import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { FILES_MESSAGES } from 'src/common/constants/messages/files.messages';
import { ClientsRepository } from 'src/modules/clients/repositories/clients.repository';
import { FilesRepository } from '../repositories/files.repository';
import { ClientFile, FileFormat } from '../schemas/client-file.schema';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const MIME_TO_FORMAT: Record<string, FileFormat> = {
  'application/pdf': FileFormat.PDF,
  'application/msword': FileFormat.DOC,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    FileFormat.DOCX,
  'image/png': FileFormat.PNG,
  'image/jpeg': FileFormat.JPG,
  'image/jpg': FileFormat.JPG,
};

interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
}

type PublicClientFile = Omit<ClientFile, 'cloudinaryPublicId'>;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly clientsRepository: ClientsRepository,
  ) {}

  async listClientFiles(
    businessId: string,
    clientId: string,
  ): Promise<
    PublicClientFile[] | NotFoundException | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const client = await this.clientsRepository.findById(clientId, bId);
      if (!client) {
        return new NotFoundException(FILES_MESSAGES.ERROR.NOT_FOUND);
      }

      const rows = await this.filesRepository.findAllForClient(bId, client._id);
      return rows.map((row) => this.sanitizeFile(row));
    } catch (error) {
      this.logger.error(
        `listClientFiles: failed [businessId=${businessId}, clientId=${clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Uploads a client file to Cloudinary and stores only metadata in MongoDB.
   *
   * Example:
   * - Multipart file arrives at POST /clients/:clientId/files
   * - Binary data streams directly to Cloudinary
   * - Saved DB row points to secure URL + publicId for future retrieval/deletion
   */
  async uploadClientFile(
    businessId: string,
    clientId: string,
    userId: string,
    file?: Express.Multer.File,
  ): Promise<
    | PublicClientFile
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      if (!file) {
        return new BadRequestException(COMMON_MESSAGES.ERROR.BAD_REQUEST);
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        return new BadRequestException(FILES_MESSAGES.ERROR.SIZE_EXCEEDED);
      }

      const format = MIME_TO_FORMAT[file.mimetype];
      if (!format) {
        return new BadRequestException(FILES_MESSAGES.ERROR.INVALID_TYPE);
      }

      const bId = new Types.ObjectId(businessId);
      const client = await this.clientsRepository.findById(clientId, bId);
      if (!client) {
        return new NotFoundException(FILES_MESSAGES.ERROR.NOT_FOUND);
      }

      const uploaded = await this.uploadToCloudinary(
        file,
        businessId,
        clientId,
      );
      const created = await this.filesRepository.create({
        businessId: bId,
        clientId: client._id,
        filename: file.originalname,
        cloudinaryPublicId: uploaded.publicId,
        url: uploaded.secureUrl,
        format,
        filesizeBytes: file.size,
        uploadedBy: Types.ObjectId.isValid(userId)
          ? new Types.ObjectId(userId)
          : undefined,
      });

      return this.sanitizeFile(created);
    } catch (error) {
      this.logger.error(
        `uploadClientFile: failed [businessId=${businessId}, clientId=${clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async getFileUrl(
    fileId: string,
    businessId: string,
  ): Promise<
    { url: string } | NotFoundException | InternalServerErrorException
  > {
    try {
      const file = await this.filesRepository.findById(
        fileId,
        new Types.ObjectId(businessId),
      );
      if (!file) {
        return new NotFoundException(FILES_MESSAGES.ERROR.NOT_FOUND);
      }

      return { url: file.url };
    } catch (error) {
      this.logger.error(
        `getFileUrl: failed [fileId=${fileId}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  async deleteFile(
    fileId: string,
    businessId: string,
  ): Promise<null | NotFoundException | InternalServerErrorException> {
    try {
      const deleted = await this.filesRepository.softDelete(
        fileId,
        new Types.ObjectId(businessId),
      );

      if (!deleted) {
        return new NotFoundException(FILES_MESSAGES.ERROR.NOT_FOUND);
      }

      void this.destroyCloudinaryAsset(deleted.cloudinaryPublicId);
      return null;
    } catch (error) {
      this.logger.error(
        `deleteFile: failed [fileId=${fileId}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private async uploadToCloudinary(
    file: Express.Multer.File,
    businessId: string,
    clientId: string,
  ): Promise<CloudinaryUploadResult> {
    return new Promise<CloudinaryUploadResult>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `servixos/client-files/${businessId}/${clientId}`,
          resource_type: 'auto',
          use_filename: true,
          unique_filename: true,
        },
        (error, result) => {
          if (error || !result) {
            return reject(
              new Error(error?.message ?? FILES_MESSAGES.ERROR.UPLOAD_FAILED),
            );
          }

          resolve({
            secureUrl: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  private async destroyCloudinaryAsset(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    } catch {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    }
  }

  private sanitizeFile(file: ClientFile): PublicClientFile {
    const { cloudinaryPublicId: _cloudinaryPublicId, ...safeFile } = file;
    return safeFile;
  }
}
