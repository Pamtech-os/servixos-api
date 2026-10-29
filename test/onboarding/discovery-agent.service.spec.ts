import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { ONBOARDING_MESSAGES } from 'src/common/constants/messages/onboarding.messages';
import { SupportedCountry } from 'src/common/constants/countries.constants';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { OnboardingSessionRepository } from 'src/modules/onboarding/repositories/onboarding-session.repository';
import {
  ChatRole,
  ProfileSection,
  StartingPoint,
} from 'src/modules/onboarding/schemas/onboarding-session.schema';
import { DiscoveryAgentService } from 'src/modules/onboarding/services/discovery-agent.service';
import { OnboardingService } from 'src/modules/onboarding/services/onboarding.service';
import type { DiscoveryEvent } from 'src/modules/onboarding/types/onboarding.types';
import { User, UserRole } from 'src/modules/users/schemas/user.schema';
import { asMock } from 'test/helpers/mock';

const USER_ID = new Types.ObjectId();
const USER = {
  _id: USER_ID,
  firstName: 'Ada',
  country: SupportedCountry.NG,
  userRole: UserRole.OWNER,
} as User;

type FakeResponse = {
  texts?: string[];
  content?: Anthropic.ContentBlock[];
  stop_reason: Anthropic.StopReason;
};

function toolUse(name: string, input: unknown, id = 'toolu_1') {
  return { type: 'tool_use', id, name, input } as Anthropic.ToolUseBlock;
}

/** Minimal stand-in for MessageStream: replays text deltas, then resolves the final message. */
function fakeStream(response: FakeResponse) {
  const listeners: ((delta: string) => void)[] = [];
  const stream = {
    on(event: string, cb: (delta: string) => void) {
      if (event === 'text') listeners.push(cb);
      return stream;
    },
    finalMessage() {
      for (const t of response.texts ?? []) listeners.forEach((cb) => cb(t));
      return Promise.resolve({
        content: response.content ?? [],
        stop_reason: response.stop_reason,
        stop_details: null,
      });
    },
  };
  return stream;
}

describe('DiscoveryAgentService.chat', () => {
  let service: DiscoveryAgentService;
  let streamMock: jest.Mock;
  let onboardingService: {
    applyAiSection: jest.Mock;
    setStartingPoint: jest.Mock;
  };
  let sessionRepository: {
    findOrCreateByUserId: jest.Mock;
    appendTurns: jest.Mock;
  };
  let redis: { setIfAbsent: jest.Mock; del: jest.Mock };
  let events: DiscoveryEvent[];

  const run = (message = 'Hi') =>
    service.chat(
      USER,
      message,
      (e) => events.push(e),
      new AbortController().signal,
    );
  const queue = (...responses: FakeResponse[]) =>
    responses.forEach((r) => streamMock.mockReturnValueOnce(fakeStream(r)));
  const sentParams = (call: number) =>
    (streamMock.mock.calls as [Anthropic.MessageStreamParams][])[call][0];

  beforeEach(() => {
    events = [];
    streamMock = jest.fn();
    onboardingService = {
      applyAiSection: jest
        .fn()
        .mockResolvedValue({ ok: true, value: { summary: 's' } }),
      setStartingPoint: jest.fn().mockResolvedValue(undefined),
    };
    sessionRepository = {
      findOrCreateByUserId: jest
        .fn()
        .mockResolvedValue({ profile: {}, messages: [] }),
      appendTurns: jest.fn().mockResolvedValue(undefined),
    };
    redis = {
      setIfAbsent: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(undefined),
    };

    service = new DiscoveryAgentService(
      asMock<ConfigService>({ get: jest.fn() }),
      asMock<OnboardingService>(onboardingService),
      asMock<OnboardingSessionRepository>(sessionRepository),
      asMock<RedisService>(redis),
    );
    Reflect.set(service, 'anthropic', { messages: { stream: streamMock } });
    jest.spyOn(Reflect.get(service, 'logger'), 'error').mockImplementation();
    jest.spyOn(Reflect.get(service, 'logger'), 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('streams text deltas followed by done', async () => {
    // Arrange
    queue({ texts: ['Hello ', 'Ada'], stop_reason: 'end_turn' });

    // Act
    await run();

    // Assert
    expect(events).toEqual([
      { type: 'text', delta: 'Hello ' },
      { type: 'text', delta: 'Ada' },
      { type: 'done' },
    ]);
  });

  it('persists the user message and the full assistant reply', async () => {
    // Arrange
    queue({ texts: ['Hello ', 'Ada'], stop_reason: 'end_turn' });

    // Act
    await run('I like cooking');

    // Assert
    expect(
      (sessionRepository.appendTurns.mock.calls as unknown[][])[0][1],
    ).toMatchObject([
      { role: ChatRole.USER, content: 'I like cooking' },
      { role: ChatRole.ASSISTANT, content: 'Hello Ada' },
    ]);
  });

  it('applies a section tool call and emits the saved section', async () => {
    // Arrange
    const input = { summary: 's', valueProposition: 'v' };
    queue(
      { content: [toolUse('save_concept', input)], stop_reason: 'tool_use' },
      { texts: ['Drafted.'], stop_reason: 'end_turn' },
    );

    // Act
    await run();

    // Assert
    expect(events).toContainEqual({
      type: 'section',
      section: ProfileSection.CONCEPT,
      data: { summary: 's' },
    });
  });

  it('returns validation failures to the model as error tool results', async () => {
    // Arrange
    onboardingService.applyAiSection.mockResolvedValue({
      ok: false,
      error: 'name: Text is too long',
    });
    queue(
      {
        content: [toolUse('save_brand', { name: 'x' })],
        stop_reason: 'tool_use',
      },
      { stop_reason: 'end_turn' },
    );

    // Act
    await run();

    // Assert
    const followUp = sentParams(1).messages.at(-1);
    expect(followUp).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          is_error: true,
          content: 'name: Text is too long',
        },
      ],
    });
  });

  it('records the starting point from set_starting_point', async () => {
    // Arrange
    queue(
      {
        content: [toolUse('set_starting_point', { startingPoint: 'has_idea' })],
        stop_reason: 'tool_use',
      },
      { stop_reason: 'end_turn' },
    );

    // Act
    await run();

    // Assert
    expect(onboardingService.setStartingPoint).toHaveBeenCalledWith(
      USER_ID.toString(),
      StartingPoint.HAS_IDEA,
    );
  });

  it('keeps the system prompt byte-identical across a turn’s tool loop', async () => {
    // Arrange
    queue(
      {
        content: [
          toolUse('save_concept', { summary: 's', valueProposition: 'v' }),
        ],
        stop_reason: 'tool_use',
      },
      { stop_reason: 'end_turn' },
    );

    // Act
    await run();

    // Assert
    expect(JSON.stringify(sentParams(1).system)).toBe(
      JSON.stringify(sentParams(0).system),
    );
  });

  it('does not apply tool calls truncated by max_tokens', async () => {
    // Arrange
    queue({
      content: [toolUse('save_concept', { summary: 's' })],
      stop_reason: 'max_tokens',
    });

    // Act
    await run();

    // Assert
    expect(onboardingService.applyAiSection).not.toHaveBeenCalled();
  });

  it('replies with a neutral message when the model declines without text', async () => {
    // Arrange
    queue({ stop_reason: 'refusal' });

    // Act
    await run();

    // Assert
    expect(events[0]).toEqual({
      type: 'text',
      delta: ONBOARDING_MESSAGES.ERROR.AI_DECLINED,
    });
  });

  it('emits an error event when the API call fails', async () => {
    // Arrange
    streamMock.mockImplementation(() => {
      throw new Error('overloaded');
    });

    // Act
    await run();

    // Assert
    expect(events).toEqual([
      { type: 'error', message: ONBOARDING_MESSAGES.ERROR.AI_UNAVAILABLE },
    ]);
  });

  it('releases the chat lock even when the API call fails', async () => {
    // Arrange
    streamMock.mockImplementation(() => {
      throw new Error('overloaded');
    });

    // Act
    await run();

    // Assert
    expect(redis.del).toHaveBeenCalledWith(
      `onboarding:chat:${USER_ID.toString()}`,
    );
  });

  it('replays stored history starting from the first user turn', async () => {
    // Arrange
    sessionRepository.findOrCreateByUserId.mockResolvedValue({
      profile: {},
      messages: [
        { role: ChatRole.ASSISTANT, content: 'orphan', createdAt: new Date() },
        { role: ChatRole.USER, content: 'earlier', createdAt: new Date() },
        { role: ChatRole.ASSISTANT, content: 'reply', createdAt: new Date() },
      ],
    });
    queue({ stop_reason: 'end_turn' });

    // Act
    await run('now');

    // Assert
    expect(sentParams(0).messages).toEqual([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'now' },
    ]);
  });

  it('includes the user’s local currency in the system context', async () => {
    // Arrange
    queue({ stop_reason: 'end_turn' });

    // Act
    await run();

    // Assert
    const system = sentParams(0).system as Anthropic.TextBlockParam[];
    expect(system[1].text).toContain('"currency":"NGN"');
  });
});
