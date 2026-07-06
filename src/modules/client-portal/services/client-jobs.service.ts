import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CLIENT_CACHE_KEYS } from 'src/client/constants/cache-keys';
import { CLIENT_CACHE_TTLS } from 'src/client/constants/cache-ttls';
import { CLIENT_MESSAGES } from 'src/client/constants/messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import { JobsRepository } from '../../jobs/repositories/jobs.repository';
import { Job, JobStatus } from '../../jobs/schemas/job.schema';
import { RedisService } from '../../redis/services/redis.service';
import {
  ClientJobDetail,
  ClientJobListItem,
} from '../types/client-portal.types';
import { ListClientJobsDto } from '../dto/list-client-jobs.dto';

interface PaginatedClientJobs {
  data: ClientJobListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

@Injectable()
export class ClientJobsService {
  private readonly logger = new Logger(ClientJobsService.name);

  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly redisService: RedisService,
  ) {}

  /** Lists jobs scheduled for the calling client, paginated and optionally filtered by status. */
  async listJobs(
    businessId: string,
    clientId: string,
    dto: ListClientJobsDto,
  ): Promise<PaginatedClientJobs | InternalServerErrorException> {
    try {
      const pagination = resolvePagination(dto.page, dto.limit ?? 10);
      const queryHash = JSON.stringify({
        page: pagination.page,
        limit: pagination.limit,
        status: dto.status,
      });

      const cacheKey = CLIENT_CACHE_KEYS.jobs(clientId, queryHash);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as PaginatedClientJobs;
      }

      const { data, total } = await this.jobsRepository.findAll(
        new Types.ObjectId(businessId),
        { clientId, status: dto.status },
        pagination,
      );

      const meta = buildMeta(pagination.page, pagination.limit, total);
      const result: PaginatedClientJobs = {
        data: data.map((job) => this.mapJobListItem(job)),
        meta: {
          ...meta,
          hasNextPage: meta.page < meta.totalPages,
          hasPreviousPage: meta.page > 1,
        },
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(result), CLIENT_CACHE_TTLS.JOBS_LIST)
        .catch(() => undefined);

      return result;
    } catch (error) {
      this.logger.error(
        `listJobs: failed [businessId=${businessId}, clientId=${clientId}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Returns a single job owned by the calling client, or 404 if not found/not theirs. */
  async getJob(
    businessId: string,
    clientId: string,
    id: string,
  ): Promise<
    ClientJobDetail | NotFoundException | InternalServerErrorException
  > {
    try {
      const cacheKey = CLIENT_CACHE_KEYS.job(clientId, id);
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached) as ClientJobDetail;

      const job = await this.jobsRepository.findByIdForClient(
        id,
        new Types.ObjectId(businessId),
        new Types.ObjectId(clientId),
      );

      if (!job) {
        return new NotFoundException(CLIENT_MESSAGES.JOB.ERROR.NOT_FOUND);
      }

      const detail: ClientJobDetail = {
        ...this.mapJobListItem(job),
        notes: job.notes,
        startedAt: job.startedAt?.toISOString(),
        completedAt: job.completedAt?.toISOString(),
      };

      await this.redisService
        .set(cacheKey, JSON.stringify(detail), CLIENT_CACHE_TTLS.JOB_SINGLE)
        .catch(() => undefined);

      return detail;
    } catch (error) {
      this.logger.error(
        `getJob: failed [businessId=${businessId}, clientId=${clientId}, id=${id}] ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  private mapJobListItem(job: Job): ClientJobListItem {
    return {
      id: job._id.toString(),
      title: job.title,
      description: job.description,
      scheduledDate: job.scheduledDate.toISOString(),
      location: job.location,
      price: job.price,
      status: this.toClientStatus(job.status),
    };
  }

  private toClientStatus(
    status: JobStatus,
  ): 'pending' | 'in_progress' | 'completed' | 'cancelled' {
    if (status === JobStatus.IN_PROGRESS) return 'in_progress';
    if (status === JobStatus.COMPLETED) return 'completed';
    if (status === JobStatus.CANCELLED) return 'cancelled';
    return 'pending';
  }
}
