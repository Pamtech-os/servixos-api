import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AdminActivityLogsRepository } from '../repositories/admin-activity-logs.repository';
import { QueryActivityLogsDto } from '../dto/query-activity-logs.dto';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { resolvePagination, buildMeta } from 'src/common/utils/pagination.util';

@Injectable()
export class AdminActivityLogsService {
  private readonly logger = new Logger(AdminActivityLogsService.name);

  constructor(private readonly activityLogsRepo: AdminActivityLogsRepository) {}

  /** Retrieve cross-business activity logs with search and role filter. */
  async getActivityLogs(dto: QueryActivityLogsDto) {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const { data, total } = await this.activityLogsRepo.findAll(
        { search: dto.search, actorRole: dto.actorRole },
        pagination,
      );
      const meta = buildMeta(pagination.page, pagination.limit, total);
      return { logs: data, meta };
    } catch (error) {
      this.logger.error(
        `getActivityLogs: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }
}
