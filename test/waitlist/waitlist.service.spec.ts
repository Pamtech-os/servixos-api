import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { Types } from 'mongoose';
import { WaitlistService } from 'src/modules/waitlist/services/waitlist.service';
import { WaitlistRepository } from 'src/modules/waitlist/repositories/waitlist.repository';
import {
  WaitlistEntry,
  WaitlistPersona,
} from 'src/modules/waitlist/schemas/waitlist-entry.schema';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { JOBS } from 'src/common/constants/agenda.constants';
import { WAITLIST_MESSAGES } from 'src/common/constants/messages/waitlist.messages';
import { asMock } from 'test/helpers/mock';

const makeEntry = (overrides: Partial<WaitlistEntry> = {}): WaitlistEntry => ({
  _id: new Types.ObjectId(),
  firstName: 'Ada',
  email: 'ada@example.com',
  persona: WaitlistPersona.HAS_IDEA,
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  ...overrides,
});

const toAsync = <T>(items: T[]): AsyncIterable<T> => Readable.from(items);

describe('WaitlistService', () => {
  let service: WaitlistService;
  let waitlistRepo: {
    createIfAbsent: jest.Mock;
    deleteById: jest.Mock;
    findAll: jest.Mock;
    streamAll: jest.Mock;
    countByPersona: jest.Mock;
  };
  let agendaService: { now: jest.Mock };

  beforeEach(() => {
    waitlistRepo = {
      createIfAbsent: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(undefined),
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      streamAll: jest.fn().mockReturnValue(toAsync([])),
      countByPersona: jest.fn().mockResolvedValue({ total: 0 }),
    };
    agendaService = { now: jest.fn().mockResolvedValue(undefined) };
    service = new WaitlistService(
      asMock<WaitlistRepository>(waitlistRepo),
      asMock<AgendaService>(agendaService),
      new ConfigService({ JWT_SECRET: 'test-secret' }),
    );
  });

  describe('unsubscribe', () => {
    const issueToken = async (entry: WaitlistEntry): Promise<string> => {
      waitlistRepo.createIfAbsent.mockResolvedValue({ entry, created: true });
      await service.join({
        firstName: entry.firstName,
        email: entry.email,
        persona: entry.persona,
      });
      const [, data] = agendaService.now.mock.calls[0] as [
        string,
        { unsubscribeUrl: string },
      ];
      return new URL(data.unsubscribeUrl).searchParams.get('token') as string;
    };

    it('should delete the entry named by a valid token', async () => {
      // Arrange
      const entry = makeEntry();
      const token = await issueToken(entry);

      // Act
      const result = await service.unsubscribe(token);

      // Assert
      expect(result).toEqual({ unsubscribed: true });
      expect(waitlistRepo.deleteById).toHaveBeenCalledWith(
        entry._id.toString(),
      );
    });

    it('should reject a token signed for a different entry', async () => {
      // Arrange
      const token = await issueToken(makeEntry());
      const signature = token.split('.')[1];
      const forged = `${new Types.ObjectId().toString()}.${signature}`;

      // Act
      const result = await service.unsubscribe(forged);

      // Assert
      expect(result).toBeInstanceOf(BadRequestException);
      expect(waitlistRepo.deleteById).not.toHaveBeenCalled();
    });

    it.each(['', 'not-a-token', 'abc.def'])(
      'should reject the malformed token "%s"',
      async (token) => {
        // Act
        const result = await service.unsubscribe(token);

        // Assert
        expect(result).toBeInstanceOf(BadRequestException);
        expect(waitlistRepo.deleteById).not.toHaveBeenCalled();
      },
    );

    it('should return a server error when the delete fails', async () => {
      // Arrange
      const token = await issueToken(makeEntry());
      waitlistRepo.deleteById.mockRejectedValue(new Error('db down'));

      // Act
      const result = await service.unsubscribe(token);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('join', () => {
    it('should persist the signup and return the public fields', async () => {
      // Arrange
      const dto = {
        firstName: 'Ada',
        email: 'ada@example.com',
        persona: WaitlistPersona.HAS_IDEA,
      };
      waitlistRepo.createIfAbsent.mockResolvedValue({
        entry: makeEntry(),
        created: true,
      });

      // Act
      const result = await service.join(dto);

      // Assert
      expect(result).toEqual(dto);
    });

    it('should queue the waitlist confirmation email', async () => {
      // Arrange
      waitlistRepo.createIfAbsent.mockResolvedValue({
        entry: makeEntry(),
        created: true,
      });

      // Act
      await service.join({
        firstName: 'Ada',
        email: 'ada@example.com',
        persona: WaitlistPersona.HAS_IDEA,
      });

      // Assert
      expect(agendaService.now).toHaveBeenCalledWith(
        JOBS.EMAIL_WAITLIST_JOINED,
        {
          to: 'ada@example.com',
          firstName: 'Ada',
          persona: WaitlistPersona.HAS_IDEA,
          unsubscribeUrl: expect.stringMatching(
            /^https:\/\/servixos\.com\/unsubscribe\?token=[0-9a-f]{24}\.[0-9a-f]{64}$/,
          ) as string,
        },
      );
    });

    it('should still succeed when queuing the email fails', async () => {
      // Arrange
      waitlistRepo.createIfAbsent.mockResolvedValue({
        entry: makeEntry(),
        created: true,
      });
      agendaService.now.mockRejectedValue(new Error('agenda down'));

      // Act
      const result = await service.join({
        firstName: 'Ada',
        email: 'ada@example.com',
        persona: WaitlistPersona.HAS_IDEA,
      });

      // Assert
      expect(result).toEqual({
        firstName: 'Ada',
        email: 'ada@example.com',
        persona: WaitlistPersona.HAS_IDEA,
      });
    });

    it('should not queue an email when the email is already registered', async () => {
      // Arrange
      waitlistRepo.createIfAbsent.mockResolvedValue({
        entry: makeEntry(),
        created: false,
      });

      // Act
      await service.join({
        firstName: 'Ada',
        email: 'ada@example.com',
        persona: WaitlistPersona.HAS_IDEA,
      });

      // Assert
      expect(agendaService.now).not.toHaveBeenCalled();
    });

    it('should return ConflictException when the email is already registered', async () => {
      // Arrange
      waitlistRepo.createIfAbsent.mockResolvedValue({
        entry: makeEntry(),
        created: false,
      });

      // Act
      const result = await service.join({
        firstName: 'Ada',
        email: 'ada@example.com',
        persona: WaitlistPersona.BUSINESS_OWNER,
      });

      // Assert
      expect(result).toEqual(
        new ConflictException(WAITLIST_MESSAGES.ERROR.ALREADY_REGISTERED),
      );
    });

    it('should return ConflictException when a concurrent signup wins the unique index race', async () => {
      // Arrange
      waitlistRepo.createIfAbsent.mockRejectedValue({ code: 11000 });

      // Act
      const result = await service.join({
        firstName: 'Ada',
        email: 'ada@example.com',
        persona: WaitlistPersona.BUSINESS_OWNER,
      });

      // Assert
      expect(result).toEqual(
        new ConflictException(WAITLIST_MESSAGES.ERROR.ALREADY_REGISTERED),
      );
    });

    it('should return InternalServerErrorException on unexpected errors', async () => {
      // Arrange
      waitlistRepo.createIfAbsent.mockRejectedValue(new Error('db down'));

      // Act
      const result = await service.join({
        firstName: 'Ada',
        email: 'ada@example.com',
        persona: WaitlistPersona.BUSINESS_OWNER,
      });

      // Assert
      expect(result).toEqual(
        new InternalServerErrorException(WAITLIST_MESSAGES.ERROR.JOIN_FAILED),
      );
    });
  });

  describe('list', () => {
    it('should return stats, entries, and pagination meta', async () => {
      // Arrange
      const entries = [makeEntry()];
      const stats = {
        total: 1,
        aspiring_founder: 0,
        has_idea: 1,
        business_owner: 0,
        exploring: 0,
      };
      waitlistRepo.findAll.mockResolvedValue({ data: entries, total: 1 });
      waitlistRepo.countByPersona.mockResolvedValue(stats);

      // Act
      const result = await service.list({ page: 1, limit: 20 });

      // Assert
      expect(result).toEqual({
        stats,
        entries,
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });

    it('should pass trimmed search, persona and parsed dates to the repository', async () => {
      // Arrange
      const dto = {
        search: '  ada ',
        persona: WaitlistPersona.EXPLORING,
        dateFrom: '2026-10-01T00:00:00.000Z',
        dateTo: '2026-10-31T23:59:59.000Z',
      };

      // Act
      await service.list(dto);

      // Assert
      expect(waitlistRepo.findAll).toHaveBeenCalledWith(
        {
          search: 'ada',
          persona: WaitlistPersona.EXPLORING,
          dateFrom: new Date(dto.dateFrom),
          dateTo: new Date(dto.dateTo),
        },
        { page: 1, limit: 20, skip: 0 },
      );
    });

    it('should return InternalServerErrorException when the repository fails', async () => {
      // Arrange
      waitlistRepo.findAll.mockRejectedValue(new Error('db down'));

      // Act
      const result = await service.list({});

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('exportCsv', () => {
    const readCsv = async (
      result: Awaited<ReturnType<WaitlistService['exportCsv']>>,
    ): Promise<string> => {
      if (result instanceof InternalServerErrorException) throw result;
      let csv = '';
      for await (const chunk of result.stream) csv += String(chunk);
      return csv;
    };

    it('should stream a CSV with headers and human-readable persona labels', async () => {
      // Arrange
      waitlistRepo.streamAll.mockReturnValue(toAsync([makeEntry()]));

      // Act
      const csv = await readCsv(await service.exportCsv({}));

      // Assert
      expect(csv).toBe(
        '﻿First Name,Email,Describes Them,Joined At\n' +
          'Ada,ada@example.com,I have a business idea and want to get started.,2026-10-01T10:00:00.000Z',
      );
    });

    it('should stream only the header row when there are no signups', async () => {
      // Arrange
      waitlistRepo.streamAll.mockReturnValue(toAsync([]));

      // Act
      const csv = await readCsv(await service.exportCsv({}));

      // Assert
      expect(csv).toBe('﻿First Name,Email,Describes Them,Joined At');
    });

    it('should emit every row in order across batch boundaries', async () => {
      // Arrange
      const entries = Array.from({ length: 1201 }, (_, i) =>
        makeEntry({ email: `user${i}@example.com` }),
      );
      waitlistRepo.streamAll.mockReturnValue(toAsync(entries));

      // Act
      const csv = await readCsv(await service.exportCsv({}));

      // Assert
      const emails = csv
        .split('\n')
        .slice(1)
        .map((line) => line.split(',')[1]);
      expect(emails).toEqual(entries.map((e) => e.email));
    });

    it('should quote values containing commas or quotes', async () => {
      // Arrange
      waitlistRepo.streamAll.mockReturnValue(
        toAsync([
          makeEntry({
            firstName: 'Ada "Al", Jr',
            persona: WaitlistPersona.ASPIRING_FOUNDER,
          }),
        ]),
      );

      // Act
      const [, row] = (await readCsv(await service.exportCsv({}))).split('\n');

      // Assert
      expect(row).toBe(
        `"Ada ""Al"", Jr",ada@example.com,I want to start a business but don't know what to start.,2026-10-01T10:00:00.000Z`,
      );
    });

    it('should neutralise spreadsheet formula injection', async () => {
      // Arrange
      waitlistRepo.streamAll.mockReturnValue(
        toAsync([makeEntry({ firstName: '=HYPERLINK("x")' })]),
      );

      // Act
      const [, row] = (await readCsv(await service.exportCsv({}))).split('\n');

      // Assert
      expect(row.startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
    });

    it('should return InternalServerErrorException when the query fails before streaming starts', async () => {
      // Arrange
      waitlistRepo.streamAll.mockReturnValue({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error('query failed')),
        }),
      });

      // Act
      const result = await service.exportCsv({});

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });

    it('should close the cursor when the download is aborted early', async () => {
      // Arrange
      const close = jest
        .fn()
        .mockResolvedValue({ done: true, value: undefined });
      waitlistRepo.streamAll.mockReturnValue({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.resolve({ done: false, value: makeEntry() }),
          return: close,
        }),
      });
      const result = await service.exportCsv({});
      if (result instanceof InternalServerErrorException) throw result;

      // Act
      const reader = result.stream[Symbol.asyncIterator]();
      await reader.next();
      await reader.return?.();
      // Generator cleanup runs at its next yield, after the stream is destroyed
      await new Promise((resolve) => setImmediate(resolve));

      // Assert
      expect(close).toHaveBeenCalled();
    });
  });
});
