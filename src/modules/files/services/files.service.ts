import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { FILES_MESSAGES } from 'src/common/constants/messages/files.messages';
import { StorageService } from 'src/modules/storage/storage.service';
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

export interface AttachFileInput {
  url: string;
  publicId: string;
  filename: string;
  mimeType: string;
  filesizeBytes: number;
}

type PublicClientFile = Omit<ClientFile, 'cloudinaryPublicId'>;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly storageService: StorageService,
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
   * Uploads a user-submitted file directly from multipart form data and saves
   * its metadata to the client's file list. Used by the generic upload flow.
   */
  async uploadFile(
    businessId: string,
    file?: Express.Multer.File,
  ): Promise<
    | {
        url: string;
        publicId: string;
        filename: string;
        mimeType: string;
        filesizeBytes: number;
      }
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

      const { url, publicId } = await this.storageService.uploadStream(
        file,
        `servixos/uploads/${businessId}`,
      );

      return {
        url,
        publicId,
        filename: file.originalname,
        mimeType: file.mimetype,
        filesizeBytes: file.size,
      };
    } catch (error) {
      this.logger.error(
        `uploadFile: failed [businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /**
   * Records a pre-uploaded file as a client attachment. The file must have
   * been uploaded via POST /files/upload first; this call only saves the
   * metadata and associates the asset with the client.
   */
  async attachClientFile(
    businessId: string,
    clientId: string,
    userId: string,
    input: AttachFileInput,
  ): Promise<
    | PublicClientFile
    | NotFoundException
    | BadRequestException
    | InternalServerErrorException
  > {
    try {
      const format = MIME_TO_FORMAT[input.mimeType];
      if (!format) {
        return new BadRequestException(FILES_MESSAGES.ERROR.INVALID_TYPE);
      }

      const bId = new Types.ObjectId(businessId);
      const client = await this.clientsRepository.findById(clientId, bId);
      if (!client) {
        return new NotFoundException(FILES_MESSAGES.ERROR.NOT_FOUND);
      }

      const created = await this.filesRepository.create({
        businessId: bId,
        clientId: client._id,
        filename: input.filename,
        cloudinaryPublicId: input.publicId,
        url: input.url,
        format,
        filesizeBytes: input.filesizeBytes,
        uploadedBy: Types.ObjectId.isValid(userId)
          ? new Types.ObjectId(userId)
          : undefined,
      });

      return this.sanitizeFile(created);
    } catch (error) {
      this.logger.error(
        `attachClientFile: failed [businessId=${businessId}, clientId=${clientId}] ${error instanceof Error ? error.stack : String(error)}`,
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

      void this.storageService
        .delete(deleted.cloudinaryPublicId)
        .catch(() => undefined);
      return null;
    } catch (error) {
      this.logger.error(
        `deleteFile: failed [fileId=${fileId}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private sanitizeFile(file: ClientFile): PublicClientFile {
    const { cloudinaryPublicId: _cloudinaryPublicId, ...safeFile } = file;
    return safeFile;
  }
}
