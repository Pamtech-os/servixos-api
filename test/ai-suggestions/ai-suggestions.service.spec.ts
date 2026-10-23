import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AI_MESSAGES } from 'src/common/constants/messages/ai.messages';
import { COMMON_MESSAGES } from 'src/common/constants/messages/common.messages';
import {
  Business,
  SubscriptionPlan,
} from 'src/modules/business/schemas/business.schema';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { AiInsightsRepository } from 'src/modules/ai-insights/repositories/ai-insights.repository';
import type { MonthlyRevenuePoint } from 'src/modules/ai-insights/types/ai-insights.types';
import { InvoiceStatus } from 'src/modules/invoices/schemas/invoice.schema';
import { InvoicesService } from 'src/modules/invoices/services/invoices.service';
import { EmailService } from 'src/modules/email/services/email.service';
import {
  AiSuggestionsRepository,
  type AiSuggestionContent,
} from 'src/modules/ai-suggestions/repositories/ai-suggestions.repository';
import { AiSuggestion } from 'src/modules/ai-suggestions/schemas/ai-suggestion.schema';
import { AiSuggestionCopywriterService } from 'src/modules/ai-suggestions/services/ai-suggestion-copywriter.service';
import { AiSuggestionsService } from 'src/modules/ai-suggestions/services/ai-suggestions.service';
import {
  IdleClient,
  InvoiceOutcomeRow,
  OverdueInvoice,
  SuggestionCategory,
  SuggestionCopy,
  SuggestionCopyRequest,
  SuggestionKind,
  SuggestionStatus,
  SuggestionsResult,
  TrackedSuggestionsResult,
} from 'src/modules/ai-suggestions/types/ai-suggestions.types';
import { asMock } from 'test/helpers/mock';

const BID = new Types.ObjectId().toString();
const SUGGESTION_ID = new Types.ObjectId().toString();
const INVOICE_ID = new Types.ObjectId();
const CLIENT_ID = new Types.ObjectId();
const NOW = new Date('2026-10-23T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const PAYMENT_KEY = `payment_reminder:${INVOICE_ID.toString()}`;

const overdueInvoice: OverdueInvoice = {
  invoiceId: INVOICE_ID,
  invoiceNumber: 'INV-2026-0001',
  clientId: CLIENT_ID,
  clientName: 'Adaeze Okafor',
  totalAmount: 1500,
  amountPaid: 250,
  dueDate: new Date('2026-10-11T00:00:00.000Z'),
};

const idleClient: IdleClient = {
  clientId: CLIENT_ID,
  name: 'Tunde Bello',
  email: 'tunde@example.com',
  lastCompletedAt: new Date(NOW.getTime() - 60 * DAY),
  lastJobTitle: 'Gutter cleaning',
  completedJobs: 3,
};

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    _id: new Types.ObjectId(BID),
    name: 'Acme Services',
    timezone: 'UTC',
    subscription: { plan: SubscriptionPlan.PRO } as Business['subscription'],
    revenueTargetMonth: undefined,
    revenueTargetAmount: undefined,
    deletedAt: undefined,
    ...overrides,
  } as Business;
}

function makeDoc(overrides: Partial<AiSuggestion> = {}): AiSuggestion {
  return {
    _id: new Types.ObjectId(SUGGESTION_ID),
    businessId: new Types.ObjectId(BID),
    kind: SuggestionKind.PAYMENT_REMINDER,
    category: SuggestionCategory.CASH_FLOW,
    dedupeKey: PAYMENT_KEY,
    copyFingerprint: 'fp',
    status: SuggestionStatus.ACTIVE,
    title: 'Invoice INV-2026-0001 is 12 days overdue',
    description: 'Stored description',
    recommendation: 'Stored recommendation',
    review: {
      heading: 'Payment reminder',
      details: [],
      draft: {
        label: 'Reminder message',
        value: 'Original draft',
        multiline: true,
      },
      executeLabel: 'Send reminder',
      successMessage: 'Payment reminder sent for Invoice INV-2026-0001.',
    },
    payload: { invoiceId: INVOICE_ID },
    outcomeFinal: false,
    ...overrides,
  };
}

function makeTracked(overrides: Partial<AiSuggestion> = {}): AiSuggestion {
  return makeDoc({
    status: SuggestionStatus.EXECUTED,
    executedAt: new Date(NOW.getTime() - 3 * DAY),
    resolvedAt: new Date(NOW.getTime() - 3 * DAY),
    execution: { balanceDue: 1250, affectedJobIds: [] },
    ...overrides,
  });
}

function invoiceRow(
  overrides: Partial<InvoiceOutcomeRow> = {},
): InvoiceOutcomeRow {
  return {
    invoiceId: INVOICE_ID,
    status: InvoiceStatus.PENDING,
    totalAmount: 1500,
    amountPaid: 250,
    deleted: false,
    lastPaymentDate: null,
    ...overrides,
  };
}

describe('AiSuggestionsService', () => {
  let service: AiSuggestionsService;
  let businessRepo: { findById: jest.Mock; updateById: jest.Mock };
  let insightsRepo: {
    getCurrentMonthRevenue: jest.Mock;
    getRecentMonthlyRevenue: jest.Mock;
  };
  let repo: {
    getOverdueInvoices: jest.Mock;
    getClientPaymentHabits: jest.Mock;
    getIdleClients: jest.Mock;
    countFuturePricedJobs: jest.Mock;
    findUnpaidInvoice: jest.Mock;
    findActiveClient: jest.Mock;
    findFuturePricedJobIds: jest.Mock;
    bumpJobPrices: jest.Mock;
    getInvoiceOutcomes: jest.Mock;
    getFirstJobCreatedAfter: jest.Mock;
    getJobStatusCounts: jest.Mock;
    sumRevenueBetween: jest.Mock;
    findLatestByKeys: jest.Mock;
    insertActive: jest.Mock;
    updateActive: jest.Mock;
    expireActiveExcept: jest.Mock;
    expire: jest.Mock;
    findActiveById: jest.Mock;
    claim: jest.Mock;
    releaseClaim: jest.Mock;
    recordExecution: jest.Mock;
    countActive: jest.Mock;
    findExecuted: jest.Mock;
    saveOutcomes: jest.Mock;
  };
  let copywriter: { write: jest.Mock };
  let invoicesService: { sendInvoice: jest.Mock };
  let emailService: { send: jest.Mock };
  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  /** Primes the business-data reads that drive candidate generation. */
  function primeData(
    data: {
      overdue?: OverdueInvoice[];
      habits?: { clientId: Types.ObjectId; avgDaysToPay: number }[];
      idle?: IdleClient[];
      futurePricedJobs?: number;
      currentMonthRevenue?: number;
      revenueTrend?: MonthlyRevenuePoint[];
    } = {},
  ) {
    repo.getOverdueInvoices.mockResolvedValue(data.overdue ?? []);
    repo.getClientPaymentHabits.mockResolvedValue(data.habits ?? []);
    repo.getIdleClients.mockResolvedValue(data.idle ?? []);
    repo.countFuturePricedJobs.mockResolvedValue(data.futurePricedJobs ?? 0);
    insightsRepo.getCurrentMonthRevenue.mockResolvedValue(
      data.currentMonthRevenue ?? 0,
    );
    insightsRepo.getRecentMonthlyRevenue.mockResolvedValue(
      data.revenueTrend ?? [],
    );
  }

  /** The content passed to the first insertActive call. */
  function insertedContent(index = 0): AiSuggestionContent {
    const call = repo.insertActive.mock.calls[index] as unknown[];
    return call[2] as AiSuggestionContent;
  }

  async function listOk(): Promise<SuggestionsResult> {
    const result = await service.listSuggestions(BID);
    if (result instanceof Error) throw result;
    return result;
  }

  async function trackedOk(): Promise<TrackedSuggestionsResult> {
    const result = await service.listTracked(BID);
    if (result instanceof Error) throw result;
    return result;
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });

    businessRepo = {
      findById: jest.fn().mockResolvedValue(makeBusiness()),
      updateById: jest.fn().mockResolvedValue(undefined),
    };
    insightsRepo = {
      getCurrentMonthRevenue: jest.fn(),
      getRecentMonthlyRevenue: jest.fn(),
    };
    repo = {
      getOverdueInvoices: jest.fn(),
      getClientPaymentHabits: jest.fn(),
      getIdleClients: jest.fn(),
      countFuturePricedJobs: jest.fn(),
      findUnpaidInvoice: jest
        .fn()
        .mockResolvedValue({ totalAmount: 1500, amountPaid: 250 }),
      findActiveClient: jest
        .fn()
        .mockResolvedValue({ name: 'Tunde Bello', email: 'tunde@example.com' }),
      findFuturePricedJobIds: jest.fn().mockResolvedValue([]),
      bumpJobPrices: jest.fn().mockResolvedValue(0),
      getInvoiceOutcomes: jest.fn().mockResolvedValue([]),
      getFirstJobCreatedAfter: jest.fn().mockResolvedValue([]),
      getJobStatusCounts: jest
        .fn()
        .mockResolvedValue({ completed: 0, cancelled: 0 }),
      sumRevenueBetween: jest.fn().mockResolvedValue(0),
      findLatestByKeys: jest.fn().mockResolvedValue([]),
      insertActive: jest.fn(
        (
          businessId: Types.ObjectId,
          key: string,
          content: AiSuggestionContent,
        ) =>
          Promise.resolve({
            _id: new Types.ObjectId(),
            businessId,
            dedupeKey: key,
            status: SuggestionStatus.ACTIVE,
            outcomeFinal: false,
            ...content,
          }),
      ),
      updateActive: jest.fn().mockResolvedValue(undefined),
      expireActiveExcept: jest.fn().mockResolvedValue(undefined),
      expire: jest.fn().mockResolvedValue(undefined),
      findActiveById: jest.fn().mockResolvedValue(makeDoc()),
      claim: jest.fn(
        (_b: Types.ObjectId, _id: Types.ObjectId, status: string) =>
          Promise.resolve(makeDoc({ status: status as SuggestionStatus })),
      ),
      releaseClaim: jest.fn().mockResolvedValue(undefined),
      recordExecution: jest.fn().mockResolvedValue(undefined),
      countActive: jest.fn().mockResolvedValue(2),
      findExecuted: jest.fn().mockResolvedValue([]),
      saveOutcomes: jest.fn().mockResolvedValue(undefined),
    };
    copywriter = {
      write: jest.fn((requests: SuggestionCopyRequest[]) =>
        Promise.resolve(
          new Map<string, SuggestionCopy>(
            requests.map((r) => [r.key, r.fallback]),
          ),
        ),
      ),
    };
    invoicesService = {
      sendInvoice: jest
        .fn()
        .mockResolvedValue({ invoiceId: INVOICE_ID.toString(), queued: true }),
    };
    emailService = { send: jest.fn().mockResolvedValue(undefined) };
    primeData();

    service = new AiSuggestionsService(
      asMock<ConfigService>({ get: jest.fn().mockReturnValue('USD') }),
      asMock<BusinessRepository>(businessRepo),
      asMock<AiInsightsRepository>(insightsRepo),
      asMock<AiSuggestionsRepository>(repo),
      asMock<AiSuggestionCopywriterService>(copywriter),
      asMock<InvoicesService>(invoicesService),
      asMock<EmailService>(emailService),
    );

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    loggerErrorSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  // ─── listSuggestions ────────────────────────────────────────────────────────

  describe('listSuggestions', () => {
    it('should return NotFoundException when the business does not exist', async () => {
      // Arrange
      businessRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect((result as NotFoundException).message).toBe(
        COMMON_MESSAGES.ERROR.NOT_FOUND,
      );
    });

    it('should return an empty list when no suggestion applies', async () => {
      // Arrange — default primeData has no qualifying data

      // Act
      const result = await listOk();

      // Assert
      expect(result).toEqual({ count: 0, suggestions: [] });
    });

    it('should expire active suggestions whose subject no longer qualifies', async () => {
      // Arrange
      primeData({ overdue: [overdueInvoice] });

      // Act
      await listOk();

      // Assert
      expect(repo.expireActiveExcept).toHaveBeenCalledWith(
        new Types.ObjectId(BID),
        [PAYMENT_KEY],
        NOW,
      );
    });

    it('should build a cash_flow payment reminder with a computed title and details', async () => {
      // Arrange
      primeData({ overdue: [overdueInvoice] });

      // Act
      await listOk();

      // Assert
      const content = insertedContent();
      expect(content).toMatchObject({
        kind: SuggestionKind.PAYMENT_REMINDER,
        category: SuggestionCategory.CASH_FLOW,
        title: 'Invoice INV-2026-0001 is 12 days overdue',
        review: {
          heading: 'Payment reminder',
          details: [
            { label: 'Customer', value: 'Adaeze Okafor' },
            { label: 'Invoice', value: 'INV-2026-0001' },
            { label: 'Amount due', value: '$1,250' },
            { label: 'Due date', value: 'Oct 11, 2026' },
            { label: 'Days overdue', value: '12' },
          ],
          executeLabel: 'Send reminder',
          successMessage: 'Payment reminder sent for Invoice INV-2026-0001.',
        },
        payload: { invoiceId: INVOICE_ID },
      });
    });

    it('should give the payment reminder an editable multiline draft message', async () => {
      // Arrange
      primeData({ overdue: [overdueInvoice] });

      // Act
      await listOk();

      // Assert
      expect(insertedContent().review.draft).toEqual({
        label: 'Reminder message',
        value: expect.stringContaining('Hi Adaeze,') as string,
        multiline: true,
      });
    });

    it("should add the customer's usual payment time when payment history exists", async () => {
      // Arrange
      primeData({
        overdue: [overdueInvoice],
        habits: [{ clientId: CLIENT_ID, avgDaysToPay: 5 }],
      });

      // Act
      await listOk();

      // Assert
      expect(insertedContent().review.details).toContainEqual({
        label: 'Usually pays',
        value: 'within 5 days',
      });
    });

    it('should use the Claude-written copy when the copywriter returns it', async () => {
      // Arrange
      primeData({ overdue: [overdueInvoice] });
      copywriter.write.mockResolvedValue(
        new Map([
          [
            PAYMENT_KEY,
            {
              description: 'AI description',
              recommendation: 'AI recommendation',
              draftMessage: 'AI draft',
            },
          ],
        ]),
      );

      // Act
      await listOk();

      // Assert
      expect(insertedContent()).toMatchObject({
        description: 'AI description',
        recommendation: 'AI recommendation',
        review: { draft: { value: 'AI draft' } },
      });
    });

    it('should return suggestions in the wire shape without internal fields', async () => {
      // Arrange
      primeData({ overdue: [overdueInvoice] });

      // Act
      const result = await listOk();

      // Assert
      expect(Object.keys(result.suggestions[0]).sort()).toEqual([
        'category',
        'description',
        'id',
        'recommendation',
        'review',
        'title',
      ]);
    });

    it('should return a unique string id per suggestion instance', async () => {
      // Arrange
      const second: OverdueInvoice = {
        ...overdueInvoice,
        invoiceId: new Types.ObjectId(),
        invoiceNumber: 'INV-2026-0002',
      };
      primeData({ overdue: [overdueInvoice, second] });

      // Act
      const result = await listOk();

      // Assert
      const ids = result.suggestions.map((s) => s.id);
      expect(new Set(ids).size).toBe(2);
    });

    it('should build a customer_retention follow-up for an idle client', async () => {
      // Arrange
      primeData({ idle: [idleClient] });

      // Act
      await listOk();

      // Assert
      expect(insertedContent()).toMatchObject({
        kind: SuggestionKind.CLIENT_FOLLOW_UP,
        category: SuggestionCategory.CUSTOMER_RETENTION,
        title: "Tunde Bello hasn't booked in 60 days",
        review: {
          draft: { label: 'Follow-up message', multiline: true },
          executeLabel: 'Send follow-up',
        },
        payload: { clientId: CLIENT_ID },
      });
    });

    it('should build a revenue target with a single-line numeric draft', async () => {
      // Arrange
      primeData({
        revenueTrend: [
          { month: '2026-08', revenue: 1000 },
          { month: '2026-09', revenue: 1100 },
        ],
      });

      // Act
      await listOk();

      // Assert
      expect(insertedContent()).toMatchObject({
        kind: SuggestionKind.REVENUE_TARGET,
        category: SuggestionCategory.CASH_FLOW,
        title: 'Set a $1,210 revenue target for November 2026',
        review: {
          draft: {
            label: 'Target amount (USD)',
            value: '1210',
            multiline: false,
          },
        },
        payload: { targetMonth: '2026-11' },
      });
    });

    it('should skip the revenue target when one is already set for next month', async () => {
      // Arrange
      businessRepo.findById.mockResolvedValue(
        makeBusiness({ revenueTargetMonth: '2026-11' }),
      );
      primeData({
        revenueTrend: [
          { month: '2026-08', revenue: 1000 },
          { month: '2026-09', revenue: 1100 },
        ],
      });

      // Act
      const result = await listOk();

      // Assert
      expect(result.count).toBe(0);
    });

    it('should build a pricing suggestion with an editable percentage', async () => {
      // Arrange
      primeData({ futurePricedJobs: 4, currentMonthRevenue: 5000 });

      // Act
      await listOk();

      // Assert
      expect(insertedContent()).toMatchObject({
        kind: SuggestionKind.PRICE_INCREASE,
        category: SuggestionCategory.PRICING,
        title: 'A 10% price increase could add $500/month',
        review: {
          draft: { label: 'Price increase (%)', value: '10', multiline: false },
          executeLabel: 'Update prices',
        },
      });
    });

    it('should interleave categories so limited plans see a mix', async () => {
      // Arrange
      const invoices = [0, 1, 2].map((i) => ({
        ...overdueInvoice,
        invoiceId: new Types.ObjectId(),
        invoiceNumber: `INV-${i}`,
      }));
      const clients = [0, 1].map(() => ({
        ...idleClient,
        clientId: new Types.ObjectId(),
      }));
      primeData({ overdue: invoices, idle: clients });

      // Act
      const result = await listOk();

      // Assert
      expect(result.suggestions.map((s) => s.category)).toEqual([
        SuggestionCategory.CASH_FLOW,
        SuggestionCategory.CUSTOMER_RETENTION,
        SuggestionCategory.CASH_FLOW,
        SuggestionCategory.CUSTOMER_RETENTION,
        SuggestionCategory.CASH_FLOW,
      ]);
    });

    it("should cap the list at the plan's suggestion limit", async () => {
      // Arrange
      businessRepo.findById.mockResolvedValue(
        makeBusiness({
          subscription: {
            plan: SubscriptionPlan.STARTER,
          } as Business['subscription'],
        }),
      );
      const invoices = Array.from({ length: 8 }, (_, i) => ({
        ...overdueInvoice,
        invoiceId: new Types.ObjectId(),
        invoiceNumber: `INV-${i}`,
      }));
      primeData({ overdue: invoices });

      // Act
      const result = await listOk();

      // Assert
      expect(result.count).toBe(5);
    });

    it('should hide a subject that was executed within its cooldown', async () => {
      // Arrange
      primeData({ overdue: [overdueInvoice] });
      repo.findLatestByKeys.mockResolvedValue([
        makeDoc({
          status: SuggestionStatus.EXECUTED,
          resolvedAt: new Date(NOW.getTime() - 2 * DAY),
        }),
      ]);

      // Act
      const result = await listOk();

      // Assert
      expect(result.count).toBe(0);
    });

    it('should suggest the subject again once the cooldown has passed', async () => {
      // Arrange
      primeData({ overdue: [overdueInvoice] });
      repo.findLatestByKeys.mockResolvedValue([
        makeDoc({
          status: SuggestionStatus.DISMISSED,
          resolvedAt: new Date(NOW.getTime() - 10 * DAY),
        }),
      ]);

      // Act
      await listOk();

      // Assert
      expect(repo.insertActive).toHaveBeenCalledTimes(1);
    });

    it('should not call Claude again when an active suggestion has unchanged facts', async () => {
      // Arrange
      primeData({ overdue: [overdueInvoice] });
      await listOk();
      const existing = makeDoc(insertedContent());
      repo.findLatestByKeys.mockResolvedValue([existing]);
      copywriter.write.mockClear();

      // Act
      await listOk();

      // Assert
      expect(copywriter.write).toHaveBeenCalledWith([]);
    });

    it('should keep the stored id and copy when an active suggestion is reused', async () => {
      // Arrange
      primeData({ overdue: [overdueInvoice] });
      await listOk();
      repo.findLatestByKeys.mockResolvedValue([
        makeDoc({ ...insertedContent(), description: 'Stored AI copy' }),
      ]);

      // Act
      const result = await listOk();

      // Assert
      expect(result.suggestions[0]).toMatchObject({
        id: SUGGESTION_ID,
        description: 'Stored AI copy',
      });
    });

    it('should refresh only the computed figures when days overdue changed', async () => {
      // Arrange
      primeData({ overdue: [overdueInvoice] });
      await listOk();
      const yesterday = insertedContent();
      repo.findLatestByKeys.mockResolvedValue([
        makeDoc({
          ...yesterday,
          title: 'Invoice INV-2026-0001 is 11 days overdue',
        }),
      ]);

      // Act
      await listOk();

      // Assert
      expect(repo.updateActive).toHaveBeenLastCalledWith(
        new Types.ObjectId(BID),
        [
          {
            id: new Types.ObjectId(SUGGESTION_ID),
            set: {
              title: 'Invoice INV-2026-0001 is 12 days overdue',
              review: yesterday.review,
            },
          },
        ],
      );
    });

    it('should rewrite the copy when the underlying facts changed', async () => {
      // Arrange
      primeData({ overdue: [overdueInvoice] });
      repo.findLatestByKeys.mockResolvedValue([
        makeDoc({ copyFingerprint: 'stale' }),
      ]);

      // Act
      await listOk();

      // Assert
      expect(copywriter.write).toHaveBeenCalledWith([
        expect.objectContaining({ key: PAYMENT_KEY }),
      ]);
    });

    it('should return InternalServerErrorException on unexpected errors', async () => {
      // Arrange
      repo.getOverdueInvoices.mockRejectedValue(new Error('db down'));

      // Act
      const result = await service.listSuggestions(BID);

      // Assert
      expect((result as InternalServerErrorException).message).toBe(
        AI_MESSAGES.ERROR.SUGGESTIONS_FAILED,
      );
    });
  });

  // ─── executeSuggestion ──────────────────────────────────────────────────────

  describe('executeSuggestion', () => {
    it('should return NotFoundException when the suggestion is not active', async () => {
      // Arrange
      repo.findActiveById.mockResolvedValue(null);

      // Act
      const result = await service.executeSuggestion(BID, SUGGESTION_ID);

      // Assert
      expect((result as NotFoundException).message).toBe(
        AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND,
      );
    });

    it('should send the reminder with the user-edited draft', async () => {
      // Arrange
      const edited = 'Hi Adaeze, edited by the user';

      // Act
      await service.executeSuggestion(BID, SUGGESTION_ID, edited);

      // Assert
      expect(invoicesService.sendInvoice).toHaveBeenCalledWith(
        INVOICE_ID.toString(),
        BID,
        { reminderMessage: edited },
      );
    });

    it('should send the original draft when no edit is provided', async () => {
      // Arrange — findActiveById returns the stored "Original draft"

      // Act
      await service.executeSuggestion(BID, SUGGESTION_ID);

      // Assert
      expect(invoicesService.sendInvoice).toHaveBeenCalledWith(
        INVOICE_ID.toString(),
        BID,
        { reminderMessage: 'Original draft' },
      );
    });

    it('should return BadRequestException when the edited draft is blank', async () => {
      // Arrange
      const blank = '   ';

      // Act
      const result = await service.executeSuggestion(BID, SUGGESTION_ID, blank);

      // Assert
      expect((result as BadRequestException).message).toBe(
        AI_MESSAGES.ERROR.DRAFT_REQUIRED,
      );
    });

    it('should return id, remaining and executedAt on success', async () => {
      // Arrange
      repo.countActive.mockResolvedValue(2);

      // Act
      const result = await service.executeSuggestion(BID, SUGGESTION_ID);

      // Assert
      expect(result).toEqual({
        id: SUGGESTION_ID,
        remaining: 2,
        executedAt: NOW.toISOString(),
      });
    });

    it('should record the balance due as the outcome baseline', async () => {
      // Arrange — invoice has 1500 total, 250 paid

      // Act
      await service.executeSuggestion(BID, SUGGESTION_ID);

      // Assert
      expect(repo.recordExecution).toHaveBeenCalledWith(
        new Types.ObjectId(BID),
        new Types.ObjectId(SUGGESTION_ID),
        { draftValue: 'Original draft', balanceDue: 1250, affectedJobIds: [] },
        undefined,
      );
    });

    it('should expire the suggestion when the invoice was already paid', async () => {
      // Arrange
      repo.findUnpaidInvoice.mockResolvedValue(null);

      // Act
      const result = await service.executeSuggestion(BID, SUGGESTION_ID);

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
      expect(repo.expire).toHaveBeenCalledWith(
        new Types.ObjectId(BID),
        new Types.ObjectId(SUGGESTION_ID),
        NOW,
      );
    });

    it('should not run the action when another request already claimed it', async () => {
      // Arrange
      repo.claim.mockResolvedValue(null);

      // Act
      await service.executeSuggestion(BID, SUGGESTION_ID);

      // Assert
      expect(invoicesService.sendInvoice).not.toHaveBeenCalled();
    });

    it('should release the claim and return 500 when the action fails', async () => {
      // Arrange
      invoicesService.sendInvoice.mockResolvedValue(
        new InternalServerErrorException('queue down'),
      );

      // Act
      const result = await service.executeSuggestion(BID, SUGGESTION_ID);

      // Assert
      expect((result as InternalServerErrorException).message).toBe(
        AI_MESSAGES.ERROR.SUGGESTION_EXECUTE_FAILED,
      );
      expect(repo.releaseClaim).toHaveBeenCalledWith(
        new Types.ObjectId(BID),
        new Types.ObjectId(SUGGESTION_ID),
      );
    });

    it('should still report success when recording the execution fails', async () => {
      // Arrange
      repo.recordExecution.mockRejectedValue(new Error('write failed'));

      // Act
      const result = await service.executeSuggestion(BID, SUGGESTION_ID);

      // Assert
      expect(result).toMatchObject({ id: SUGGESTION_ID });
    });

    it('should email the client the edited follow-up with HTML escaped', async () => {
      // Arrange
      repo.findActiveById.mockResolvedValue(
        makeDoc({
          kind: SuggestionKind.CLIENT_FOLLOW_UP,
          payload: { clientId: CLIENT_ID },
        }),
      );

      // Act
      await service.executeSuggestion(BID, SUGGESTION_ID, 'Hi <Tunde>\nBye');

      // Assert
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'tunde@example.com',
          html: expect.stringContaining('Hi &lt;Tunde&gt;<br />Bye') as string,
        }),
      );
    });

    it('should set the revenue target to the parsed edited amount', async () => {
      // Arrange
      repo.findActiveById.mockResolvedValue(
        makeDoc({
          kind: SuggestionKind.REVENUE_TARGET,
          payload: { targetMonth: '2026-11' },
          review: {
            ...makeDoc().review,
            draft: {
              label: 'Target amount (USD)',
              value: '1210',
              multiline: false,
            },
          },
        }),
      );

      // Act
      await service.executeSuggestion(BID, SUGGESTION_ID, '$12,500');

      // Assert
      expect(businessRepo.updateById).toHaveBeenCalledWith(BID, {
        revenueTargetMonth: '2026-11',
        revenueTargetAmount: 12500,
      });
    });

    it('should reject a non-numeric revenue target without claiming it', async () => {
      // Arrange
      repo.findActiveById.mockResolvedValue(
        makeDoc({
          kind: SuggestionKind.REVENUE_TARGET,
          payload: { targetMonth: '2026-11' },
        }),
      );

      // Act
      const result = await service.executeSuggestion(BID, SUGGESTION_ID, 'abc');

      // Assert
      expect((result as BadRequestException).message).toBe(
        AI_MESSAGES.ERROR.TARGET_AMOUNT_INVALID,
      );
      expect(repo.claim).not.toHaveBeenCalled();
    });

    it('should reprice upcoming jobs by the edited percentage', async () => {
      // Arrange
      const jobIds = [new Types.ObjectId(), new Types.ObjectId()];
      repo.findActiveById.mockResolvedValue(
        makeDoc({ kind: SuggestionKind.PRICE_INCREASE, payload: {} }),
      );
      repo.findFuturePricedJobIds.mockResolvedValue(jobIds);

      // Act
      await service.executeSuggestion(BID, SUGGESTION_ID, '15%');

      // Assert
      expect(repo.bumpJobPrices).toHaveBeenCalledWith(
        new Types.ObjectId(BID),
        jobIds,
        NOW,
        15,
      );
    });

    it('should reject a price increase above 100%', async () => {
      // Arrange
      repo.findActiveById.mockResolvedValue(
        makeDoc({ kind: SuggestionKind.PRICE_INCREASE, payload: {} }),
      );

      // Act
      const result = await service.executeSuggestion(BID, SUGGESTION_ID, '150');

      // Assert
      expect((result as BadRequestException).message).toBe(
        AI_MESSAGES.ERROR.PRICE_INCREASE_INVALID,
      );
    });

    it('should record an immediate outcome when no jobs needed repricing', async () => {
      // Arrange
      repo.findActiveById.mockResolvedValue(
        makeDoc({ kind: SuggestionKind.PRICE_INCREASE, payload: {} }),
      );

      // Act
      await service.executeSuggestion(BID, SUGGESTION_ID, '10');

      // Assert
      expect(repo.recordExecution).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ pricePct: 10, affectedJobIds: [] }),
        'no upcoming jobs needed repricing.',
      );
    });
  });

  // ─── dismissSuggestion ──────────────────────────────────────────────────────

  describe('dismissSuggestion', () => {
    it('should claim the suggestion as dismissed and return id and remaining', async () => {
      // Arrange
      repo.countActive.mockResolvedValue(1);

      // Act
      const result = await service.dismissSuggestion(BID, SUGGESTION_ID);

      // Assert
      expect(result).toEqual({ id: SUGGESTION_ID, remaining: 1 });
    });

    it('should return NotFoundException when the suggestion is no longer active', async () => {
      // Arrange
      repo.claim.mockResolvedValue(null);

      // Act
      const result = await service.dismissSuggestion(BID, SUGGESTION_ID);

      // Assert
      expect((result as NotFoundException).message).toBe(
        AI_MESSAGES.ERROR.SUGGESTION_NOT_FOUND,
      );
    });
  });

  // ─── listTracked ────────────────────────────────────────────────────────────

  describe('listTracked', () => {
    it('should map executed suggestions to the tracked shape', async () => {
      // Arrange
      repo.findExecuted.mockResolvedValue([makeTracked()]);
      repo.getInvoiceOutcomes.mockResolvedValue([invoiceRow()]);

      // Act
      const result = await trackedOk();

      // Assert
      expect(result.tracked).toEqual([
        {
          id: SUGGESTION_ID,
          category: SuggestionCategory.CASH_FLOW,
          title: 'Invoice INV-2026-0001 is 12 days overdue',
          executeLabel: 'Send reminder',
          executedAt: new Date(NOW.getTime() - 3 * DAY).toISOString(),
          outcome: null,
        },
      ]);
    });

    it('should return a stored final outcome without re-evaluating it', async () => {
      // Arrange
      repo.findExecuted.mockResolvedValue([
        makeTracked({ outcome: 'paid 2 days later.', outcomeFinal: true }),
      ]);

      // Act
      const result = await trackedOk();

      // Assert
      expect(result.tracked[0].outcome).toBe('paid 2 days later.');
      expect(repo.getInvoiceOutcomes).not.toHaveBeenCalled();
    });

    it('should report how many days after the reminder the invoice was paid', async () => {
      // Arrange
      repo.findExecuted.mockResolvedValue([makeTracked()]);
      repo.getInvoiceOutcomes.mockResolvedValue([
        invoiceRow({
          status: InvoiceStatus.PAID,
          amountPaid: 1500,
          lastPaymentDate: new Date(NOW.getTime() - 1 * DAY),
        }),
      ]);

      // Act
      const result = await trackedOk();

      // Assert
      expect(result.tracked[0].outcome).toBe('paid 2 days later.');
    });

    it('should persist an outcome once it is final', async () => {
      // Arrange
      repo.findExecuted.mockResolvedValue([makeTracked()]);
      repo.getInvoiceOutcomes.mockResolvedValue([
        invoiceRow({ status: InvoiceStatus.PAID, lastPaymentDate: NOW }),
      ]);

      // Act
      await trackedOk();

      // Assert
      expect(repo.saveOutcomes).toHaveBeenCalledWith(new Types.ObjectId(BID), [
        {
          id: new Types.ObjectId(SUGGESTION_ID),
          outcome: 'paid 3 days later.',
          outcomeFinal: true,
        },
      ]);
    });

    it('should report a partial payment received since the reminder', async () => {
      // Arrange
      repo.findExecuted.mockResolvedValue([makeTracked()]);
      repo.getInvoiceOutcomes.mockResolvedValue([
        invoiceRow({ status: InvoiceStatus.PARTIAL, amountPaid: 750 }),
      ]);

      // Act
      const result = await trackedOk();

      // Assert
      expect(result.tracked[0].outcome).toBe(
        'partially paid, $500 received so far.',
      );
    });

    it('should report no payment once the tracking window has passed', async () => {
      // Arrange
      repo.findExecuted.mockResolvedValue([
        makeTracked({ executedAt: new Date(NOW.getTime() - 31 * DAY) }),
      ]);
      repo.getInvoiceOutcomes.mockResolvedValue([invoiceRow()]);

      // Act
      const result = await trackedOk();

      // Assert
      expect(result.tracked[0].outcome).toBe(
        'no payment received within 30 days.',
      );
    });

    it('should report when the invoice was deleted', async () => {
      // Arrange
      repo.findExecuted.mockResolvedValue([makeTracked()]);
      repo.getInvoiceOutcomes.mockResolvedValue([
        invoiceRow({ deleted: true }),
      ]);

      // Act
      const result = await trackedOk();

      // Assert
      expect(result.tracked[0].outcome).toBe('the invoice was deleted.');
    });

    it('should report when a followed-up client booked a new job', async () => {
      // Arrange
      const executedAt = new Date(NOW.getTime() - 5 * DAY);
      repo.findExecuted.mockResolvedValue([
        makeTracked({
          kind: SuggestionKind.CLIENT_FOLLOW_UP,
          category: SuggestionCategory.CUSTOMER_RETENTION,
          payload: { clientId: CLIENT_ID },
          executedAt,
        }),
      ]);
      repo.getFirstJobCreatedAfter.mockResolvedValue([
        {
          clientId: CLIENT_ID,
          firstCreatedAt: new Date(executedAt.getTime() + 3 * DAY),
        },
      ]);

      // Act
      const result = await trackedOk();

      // Assert
      expect(result.tracked[0].outcome).toBe('booked a new job 3 days later.');
    });

    it('should keep a revenue target pending until its month has ended', async () => {
      // Arrange
      repo.findExecuted.mockResolvedValue([
        makeTracked({
          kind: SuggestionKind.REVENUE_TARGET,
          payload: { targetMonth: '2026-11' },
          execution: { targetAmount: 10000, affectedJobIds: [] },
        }),
      ]);

      // Act
      const result = await trackedOk();

      // Assert
      expect(result.tracked[0].outcome).toBeNull();
    });

    it('should compare actual revenue to the target after the month ends', async () => {
      // Arrange
      repo.findExecuted.mockResolvedValue([
        makeTracked({
          kind: SuggestionKind.REVENUE_TARGET,
          payload: { targetMonth: '2026-09' },
          execution: { targetAmount: 10000, affectedJobIds: [] },
        }),
      ]);
      repo.sumRevenueBetween.mockResolvedValue(11200);

      // Act
      const result = await trackedOk();

      // Assert
      expect(result.tracked[0].outcome).toBe(
        'reached $11,200 of the $10,000 target (112%).',
      );
    });

    it('should report repriced-job progress while jobs are still open', async () => {
      // Arrange
      repo.findExecuted.mockResolvedValue([
        makeTracked({
          kind: SuggestionKind.PRICE_INCREASE,
          payload: {},
          execution: {
            pricePct: 10,
            affectedJobIds: [1, 2, 3, 4].map(() => new Types.ObjectId()),
          },
        }),
      ]);
      repo.getJobStatusCounts.mockResolvedValue({ completed: 1, cancelled: 0 });

      // Act
      const result = await trackedOk();

      // Assert
      expect(result.tracked[0].outcome).toBe(
        '1 of 4 repriced jobs completed so far.',
      );
    });

    it('should finalise the pricing outcome once every repriced job is settled', async () => {
      // Arrange
      repo.findExecuted.mockResolvedValue([
        makeTracked({
          kind: SuggestionKind.PRICE_INCREASE,
          payload: {},
          execution: {
            pricePct: 10,
            affectedJobIds: [1, 2, 3, 4].map(() => new Types.ObjectId()),
          },
        }),
      ]);
      repo.getJobStatusCounts.mockResolvedValue({ completed: 3, cancelled: 1 });

      // Act
      const result = await trackedOk();

      // Assert
      expect(result.tracked[0].outcome).toBe(
        '3 of 4 repriced jobs completed at the new price, 1 cancelled.',
      );
    });

    it('should return InternalServerErrorException on unexpected errors', async () => {
      // Arrange
      repo.findExecuted.mockRejectedValue(new Error('db down'));

      // Act
      const result = await service.listTracked(BID);

      // Assert
      expect(result).toBeInstanceOf(InternalServerErrorException);
    });
  });
});
