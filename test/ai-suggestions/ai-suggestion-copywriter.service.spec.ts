import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiSuggestionCopywriterService } from 'src/modules/ai-suggestions/services/ai-suggestion-copywriter.service';
import {
  SuggestionCopyRequest,
  SuggestionKind,
} from 'src/modules/ai-suggestions/types/ai-suggestions.types';
import { asMock } from 'test/helpers/mock';

// ─── Anthropic mock ─────────────────────────────────────────────────────────
const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const reminderRequest: SuggestionCopyRequest = {
  key: 'payment_reminder:1',
  kind: SuggestionKind.PAYMENT_REMINDER,
  wantsDraftMessage: true,
  facts: { customerName: 'Adaeze Okafor', amountDue: '$1,250' },
  fallback: {
    description: 'Fallback description',
    recommendation: 'Fallback recommendation',
    draftMessage: 'Fallback draft',
  },
};

const pricingRequest: SuggestionCopyRequest = {
  key: 'price_increase',
  kind: SuggestionKind.PRICE_INCREASE,
  wantsDraftMessage: false,
  facts: { suggestedIncrease: '10%' },
  fallback: {
    description: 'Pricing fallback',
    recommendation: 'Raise prices',
  },
};

function claudeResponse(items: unknown[], stopReason = 'end_turn') {
  return {
    stop_reason: stopReason,
    content: [{ type: 'text', text: JSON.stringify({ items }) }],
  };
}

describe('AiSuggestionCopywriterService', () => {
  let service: AiSuggestionCopywriterService;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockCreate.mockReset();
    service = new AiSuggestionCopywriterService(
      asMock<ConfigService>({ get: jest.fn().mockReturnValue(undefined) }),
    );
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('should not call Claude when there is nothing to write', async () => {
    // Arrange
    const requests: SuggestionCopyRequest[] = [];

    // Act
    await service.write(requests);

    // Assert
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should request structured JSON output at low effort from the default model', async () => {
    // Arrange
    mockCreate.mockResolvedValue(claudeResponse([]));

    // Act
    await service.write([reminderRequest]);

    // Assert
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-5-5',
        output_config: expect.objectContaining({
          effort: 'low',
          format: expect.objectContaining({ type: 'json_schema' }) as object,
        }) as object,
      }),
      expect.objectContaining({ maxRetries: 1 }),
    );
  });

  it('should return the Claude-written copy for valid items', async () => {
    // Arrange
    mockCreate.mockResolvedValue(
      claudeResponse([
        {
          key: reminderRequest.key,
          description: ' AI description ',
          recommendation: 'AI recommendation',
          draftMessage: 'AI draft',
        },
      ]),
    );

    // Act
    const result = await service.write([reminderRequest]);

    // Assert
    expect(result.get(reminderRequest.key)).toEqual({
      description: 'AI description',
      recommendation: 'AI recommendation',
      draftMessage: 'AI draft',
    });
  });

  it('should fall back to deterministic copy when the API call fails', async () => {
    // Arrange
    mockCreate.mockRejectedValue(new Error('overloaded'));

    // Act
    const result = await service.write([reminderRequest]);

    // Assert
    expect(result.get(reminderRequest.key)).toBe(reminderRequest.fallback);
  });

  it('should fall back when Claude refuses', async () => {
    // Arrange
    mockCreate.mockResolvedValue(
      claudeResponse(
        [
          {
            key: reminderRequest.key,
            description: 'x',
            recommendation: 'y',
            draftMessage: 'z',
          },
        ],
        'refusal',
      ),
    );

    // Act
    const result = await service.write([reminderRequest]);

    // Assert
    expect(result.get(reminderRequest.key)).toBe(reminderRequest.fallback);
  });

  it('should fall back for an item with an empty description', async () => {
    // Arrange
    mockCreate.mockResolvedValue(
      claudeResponse([
        {
          key: reminderRequest.key,
          description: '   ',
          recommendation: 'AI recommendation',
          draftMessage: 'AI draft',
        },
      ]),
    );

    // Act
    const result = await service.write([reminderRequest]);

    // Assert
    expect(result.get(reminderRequest.key)).toBe(reminderRequest.fallback);
  });

  it('should fall back when a required draft message is missing', async () => {
    // Arrange
    mockCreate.mockResolvedValue(
      claudeResponse([
        {
          key: reminderRequest.key,
          description: 'AI description',
          recommendation: 'AI recommendation',
          draftMessage: '',
        },
      ]),
    );

    // Act
    const result = await service.write([reminderRequest]);

    // Assert
    expect(result.get(reminderRequest.key)).toBe(reminderRequest.fallback);
  });

  it('should drop the draft message for kinds that do not use one', async () => {
    // Arrange
    mockCreate.mockResolvedValue(
      claudeResponse([
        {
          key: pricingRequest.key,
          description: 'AI pricing',
          recommendation: 'AI raise',
          draftMessage: 'should be ignored',
        },
      ]),
    );

    // Act
    const result = await service.write([pricingRequest]);

    // Assert
    expect(result.get(pricingRequest.key)).toEqual({
      description: 'AI pricing',
      recommendation: 'AI raise',
    });
  });

  it('should ignore items for keys that were not requested', async () => {
    // Arrange
    mockCreate.mockResolvedValue(
      claudeResponse([
        {
          key: 'unknown',
          description: 'a',
          recommendation: 'b',
          draftMessage: 'c',
        },
      ]),
    );

    // Act
    const result = await service.write([pricingRequest]);

    // Assert
    expect([...result.keys()]).toEqual([pricingRequest.key]);
  });
});
