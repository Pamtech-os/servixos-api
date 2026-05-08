import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { JobsRepository } from '../../jobs/repositories/jobs.repository';

export interface ClientExportResult {
  exportUrl: string;
}

const CLOUDINARY_EXPORT_FOLDER = 'servixos/client-exports';

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);
  private readonly cloudinaryCloudName: string;
  private readonly cloudinaryApiKey: string;
  private readonly cloudinaryApiSecret: string;

  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly jobsRepository: JobsRepository,
  ) {
    const { env } = process;
    this.cloudinaryCloudName = env.CLOUDINARY_CLOUD_NAME ?? '';
    this.cloudinaryApiKey = env.CLOUDINARY_API_KEY ?? '';
    this.cloudinaryApiSecret = env.CLOUDINARY_API_SECRET ?? '';
  }

  /**
   * Exports all data associated with a client as a JSON file hosted on Cloudinary.
   *
   * Gathered data: client profile + all jobs for that client.
   * Returns a Cloudinary secure URL the business can download or share.
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
      if (!client)
        return new NotFoundException(CLIENTS_MESSAGES.ERROR.NOT_FOUND);

      const { data: jobs } = await this.jobsRepository.findAll(
        bId,
        { clientId: id },
        { page: 1, limit: 1000, skip: 0 },
      );

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        client: {
          id: client._id.toString(),
          name: client.name,
          email: client.email,
          phone: client.phone ?? null,
        },
        jobs: jobs.map((job) => ({
          id: job._id.toString(),
          title: job.title,
          description: job.description ?? null,
          status: job.status,
          scheduledDate: job.scheduledDate,
          location: job.location ?? null,
          price: job.price ?? null,
          timezone: job.timezone,
        })),
      };

      const exportUrl = await this.uploadExportToCloudinary(
        exportPayload,
        businessId,
        id,
      );

      return { exportUrl };
    } catch (error) {
      this.logger.error(
        `exportClient: unexpected error [id=${id}, businessId=${businessId}]: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(
        CLIENTS_MESSAGES.ERROR.EXPORT_FAILED,
      );
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async uploadExportToCloudinary(
    payload: unknown,
    businessId: string,
    clientId: string,
  ): Promise<string> {
    if (
      !this.cloudinaryCloudName ||
      !this.cloudinaryApiKey ||
      !this.cloudinaryApiSecret
    ) {
      throw new Error(COMMON_MESSAGES.ERROR.INTERNAL);
    }

    const jsonContent = JSON.stringify(payload, null, 2);
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `${businessId}-${clientId}-${timestamp}`;
    const signatureBase = `folder=${CLOUDINARY_EXPORT_FOLDER}&public_id=${publicId}&timestamp=${timestamp}`;
    const signature = createHash('sha1')
      .update(`${signatureBase}${this.cloudinaryApiSecret}`)
      .digest('hex');

    const form = new FormData();
    form.append(
      'file',
      new Blob([jsonContent], { type: 'application/json' }),
      `client-export-${clientId}.json`,
    );
    form.append('api_key', this.cloudinaryApiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', CLOUDINARY_EXPORT_FOLDER);
    form.append('public_id', publicId);
    form.append('signature', signature);
    form.append('resource_type', 'raw');

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudinaryCloudName}/raw/upload`,
      { method: 'POST', body: form },
    );

    const result = (await response.json()) as {
      secure_url?: string;
      error?: { message?: string };
    };

    if (!response.ok || !result.secure_url) {
      throw new Error(result.error?.message ?? 'Cloudinary upload failed');
    }

    return result.secure_url;
  }
}
