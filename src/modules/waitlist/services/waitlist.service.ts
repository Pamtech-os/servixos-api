import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Readable } from 'stream';
import { JOBS } from 'src/common/constants/agenda.constants';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import type { WaitlistJoinedJobData } from 'src/modules/agenda/jobs/email.jobs';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import { WAITLIST_MESSAGES } from 'src/common/constants/messages/waitlist.messages';
import { formatError, isDuplicateKeyError } from 'src/common/utils/error.util';
import { buildMeta, resolvePagination } from 'src/common/utils/pagination.util';
import {
  WaitlistFilters,
  WaitlistRepository,
} from '../repositories/waitlist.repository';
import { JoinWaitlistDto } from '../dto/join-waitlist.dto';
import { ExportWaitlistDto, QueryWaitlistDto } from '../dto/query-waitlist.dto';
import {
  WAITLIST_PERSONA_LABELS,
  WaitlistEntry,
} from '../schemas/waitlist-entry.schema';

// BOM so Excel opens UTF-8 names correctly
const UTF8_BOM = String.fromCharCode(0xfeff);
// Rows per write — amortises stream overhead without holding much in memory
const CSV_BATCH_SIZE = 500;
const CSV_HEADERS = ['First Name', 'Email', 'Describes Them', 'Joined At'];

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly waitlistRepo: WaitlistRepository,
    private readonly agendaService: AgendaService,
  ) {}

  /** Register a new waitlist signup and queue a confirmation email; rejects emails that are already registered. */
  async join(dto: JoinWaitlistDto) {
    try {
      const { entry, created } = await this.waitlistRepo.createIfAbsent({
        firstName: dto.firstName,
        email: dto.email,
        persona: dto.persona,
      });
      if (!created) {
        return new ConflictException(
          WAITLIST_MESSAGES.ERROR.ALREADY_REGISTERED,
        );
      }

      // Email failure must not fail the signup — the entry is already saved
      await this.agendaService
        .now<WaitlistJoinedJobData>(JOBS.EMAIL_WAITLIST_JOINED, {
          to: entry.email,
          firstName: entry.firstName,
          persona: entry.persona,
        })
        .catch((err: unknown) =>
          this.logger.error(
            `Email job "${JOBS.EMAIL_WAITLIST_JOINED}" failed: ${formatError(err)}`,
          ),
        );

      return {
        firstName: entry.firstName,
        email: entry.email,
        persona: entry.persona,
      };
    } catch (error) {
      // Two simultaneous upserts for a new email: the unique index rejects the loser with E11000
      if (isDuplicateKeyError(error)) {
        return new ConflictException(
          WAITLIST_MESSAGES.ERROR.ALREADY_REGISTERED,
        );
      }
      this.logger.error(`join: ${formatError(error)}`);
      return new InternalServerErrorException(
        WAITLIST_MESSAGES.ERROR.JOIN_FAILED,
      );
    }
  }

  /** Paginated, searchable list of waitlist signups with persona breakdown (admin). */
  async list(dto: QueryWaitlistDto) {
    try {
      const pagination = resolvePagination(dto.page, dto.limit);
      const [stats, { data, total }] = await Promise.all([
        this.waitlistRepo.countByPersona(),
        this.waitlistRepo.findAll(this.toFilters(dto), pagination),
      ]);
      const meta = buildMeta(pagination.page, pagination.limit, total);
      return { stats, entries: data, meta };
    } catch (error) {
      this.logger.error(`list: ${formatError(error)}`);
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  /** Stream a CSV of all signups matching the filters (admin export) with O(1) memory. */
  async exportCsv(dto: ExportWaitlistDto) {
    try {
      const iterator = this.waitlistRepo
        .streamAll(this.toFilters(dto))
        [Symbol.asyncIterator]();
      // Pull the first row before headers are sent so query errors still return a proper 500
      const first = await iterator.next();
      return {
        filename: `waitlist-${new Date().toISOString().slice(0, 10)}.csv`,
        stream: Readable.from(this.csvChunks(first, iterator)),
      };
    } catch (error) {
      this.logger.error(`exportCsv: ${formatError(error)}`);
      return new InternalServerErrorException(COMMON_MESSAGES.ERROR.INTERNAL);
    }
  }

  // Async generator — Readable.from only pulls the next chunk when the client is ready (backpressure),
  // so at most one batch of rows is held in memory regardless of export size
  private async *csvChunks(
    first: IteratorResult<WaitlistEntry>,
    iterator: AsyncIterator<WaitlistEntry>,
  ): AsyncGenerator<string> {
    try {
      yield `${UTF8_BOM}${CSV_HEADERS.join(',')}`;
      let batch: string[] = [];
      for (let next = first; !next.done; next = await iterator.next()) {
        batch.push(this.toCsvRow(next.value));
        if (batch.length === CSV_BATCH_SIZE) {
          yield `\n${batch.join('\n')}`;
          batch = [];
        }
      }
      if (batch.length) yield `\n${batch.join('\n')}`;
    } finally {
      // Closes the Mongo cursor if the client disconnects mid-download
      await iterator.return?.();
    }
  }

  private toFilters(dto: ExportWaitlistDto): WaitlistFilters {
    return {
      search: dto.search?.trim() || undefined,
      persona: dto.persona,
      dateFrom: dto.dateFrom ? new Date(dto.dateFrom) : undefined,
      dateTo: dto.dateTo ? new Date(dto.dateTo) : undefined,
    };
  }

  private toCsvRow(entry: WaitlistEntry): string {
    return [
      entry.firstName,
      entry.email,
      WAITLIST_PERSONA_LABELS[entry.persona] ?? '',
      entry.createdAt.toISOString(),
    ]
      .map((value) => this.escapeCsv(value))
      .join(',');
  }

  private escapeCsv(value: string): string {
    // Prefix formula-trigger characters to block CSV injection when opened in a spreadsheet
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }
}
