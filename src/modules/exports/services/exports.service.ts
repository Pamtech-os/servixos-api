import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';
import { StorageService } from 'src/modules/storage/storage.service';
import { STORAGE_FOLDERS } from 'src/modules/storage/constants/storage-folders.constants';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { JobsRepository } from '../../jobs/repositories/jobs.repository';

export interface ClientExportResult {
  exportUrl: string;
}

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Exports all data associated with a client as a JSON file hosted on storage.
   *
   * Gathered data: client profile + all jobs for that client.
   * Returns a secure URL the business can download or share.
   *
   * Example response: { exportUrl: "https://res.cloudinary.com/.../client-export-<id>.json" }
   */
  async exportClient(
    id: string,
    businessId: string,
  ): Promise<
    ClientExportResult | NotFoundException | InternalServerErrorException
  > {
    try {
      const bId = new Types.ObjectId(businessId);
      const client = await this.clientsRepository.findById(id, bId);

      if (!client) {
        return new NotFoundException(CLIENTS_MESSAGES.ERROR.NOT_FOUND);
      }

      const { data: jobs } = await this.jobsRepository.findAll(
        bId,
        { clientId: id },
        { page: 1, limit: 1000, skip: 0 },
      );

      const exportUrl = await this.uploadExport({ client, jobs }, id);

      return { exportUrl };
    } catch (error) {
      this.logger.error(
        `exportClient: failed [id=${id}, businessId=${businessId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        CLIENTS_MESSAGES.ERROR.EXPORT_FAILED,
      );
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async uploadExport(
    payload: unknown,
    clientId: string,
  ): Promise<string> {
    const jsonContent = JSON.stringify(payload, null, 2);
    const buffer = Buffer.from(jsonContent, 'utf-8');
    const { url } = await this.storageService.uploadBuffer(
      buffer,
      STORAGE_FOLDERS.clientExports,
      `client-export-${clientId}.json`,
    );
    return url;
  }
}
