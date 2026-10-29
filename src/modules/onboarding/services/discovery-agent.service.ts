import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ONBOARDING_MESSAGES } from 'src/common/constants/messages/onboarding.messages';
import { COUNTRY_CONFIG } from 'src/common/constants/countries.constants';
import { RedisService } from '../../redis/services/redis.service';
import {
  RegistrationVerificationStatus,
  type User,
} from '../../users/schemas/user.schema';
import { OnboardingSessionRepository } from '../repositories/onboarding-session.repository';
import {
  ChatRole,
  OnboardingSession,
  StartingPoint,
} from '../schemas/onboarding-session.schema';
import {
  DISCOVERY_CHAT_LOCK_TTL_SECONDS,
  DISCOVERY_DEFAULT_MODEL,
  DISCOVERY_HISTORY_TURNS,
  DISCOVERY_MAX_ITERATIONS,
  DISCOVERY_MAX_TOKENS,
  DISCOVERY_STORED_TURNS,
  DISCOVERY_SYSTEM_PROMPT,
  DISCOVERY_TOOLS,
  SECTION_BY_TOOL,
  SET_STARTING_POINT_TOOL,
} from '../constants/discovery-agent.constants';
import { OnboardingService } from './onboarding.service';
import type { DiscoveryEmitter } from '../types/onboarding.types';

const STARTING_POINTS: ReadonlySet<string> = new Set(
  Object.values(StartingPoint),
);
const chatLockKey = (userId: string) => `onboarding:chat:${userId}`;

/**
 * Conversational AI that discovers the user's goals and drafts their business
 * profile through tool calls, streaming its reply as it goes.
 *
 * History handling keeps preserved thinking valid: each user turn starts a new
 * request that replays only earlier text turns (no thinking blocks), and within
 * a turn's tool loop the system prompt is frozen and assistant content is
 * appended verbatim.
 */
@Injectable()
export class DiscoveryAgentService {
  private readonly logger = new Logger(DiscoveryAgentService.name);
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(
    config: ConfigService,
    private readonly onboardingService: OnboardingService,
    private readonly sessionRepository: OnboardingSessionRepository,
    private readonly redisService: RedisService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: config.get<string>('ANTHROPIC_API_KEY'),
    });
    this.model =
      config.get<string>('AI_ONBOARDING_MODEL') || DISCOVERY_DEFAULT_MODEL;
  }

  /** Acquires the per-user chat lock; false when a reply is already streaming. */
  async acquireChatLock(userId: string): Promise<boolean> {
    return this.redisService.setIfAbsent(
      chatLockKey(userId),
      '1',
      DISCOVERY_CHAT_LOCK_TTL_SECONDS,
    );
  }

  /** Runs one conversational turn, emitting text deltas and profile updates; always releases the chat lock. */
  async chat(
    user: User,
    message: string,
    emit: DiscoveryEmitter,
    signal: AbortSignal,
  ): Promise<void> {
    const userId = user._id.toString();
    let reply = '';

    try {
      const session = await this.sessionRepository.findOrCreateByUserId(userId);
      const system = this.buildSystem(user, session);
      const messages: Anthropic.MessageParam[] = [
        ...toHistory(session),
        { role: 'user', content: message },
      ];

      for (let i = 0; i < DISCOVERY_MAX_ITERATIONS; i++) {
        const stream = this.anthropic.messages.stream(
          {
            model: this.model,
            max_tokens: DISCOVERY_MAX_TOKENS,
            output_config: { effort: 'medium' },
            system,
            tools: DISCOVERY_TOOLS,
            messages,
          },
          { signal },
        );
        stream.on('text', (delta) => {
          reply += delta;
          emit({ type: 'text', delta });
        });

        const response = await stream.finalMessage();

        if (response.stop_reason === 'refusal') {
          this.logger.warn(
            `Discovery reply declined [userId=${userId}] category=${response.stop_details?.category ?? 'unknown'}`,
          );
          if (!reply) {
            reply = ONBOARDING_MESSAGES.ERROR.AI_DECLINED;
            emit({ type: 'text', delta: reply });
          }
          break;
        }

        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );
        if (toolUses.length === 0) break;

        // A tool input cut off at max_tokens can parse as a valid partial object — never apply it
        if (response.stop_reason === 'max_tokens') {
          this.logger.warn(`Discovery tool input truncated [userId=${userId}]`);
          break;
        }

        messages.push({ role: 'assistant', content: response.content });
        const results = await Promise.all(
          toolUses.map((block) => this.runTool(userId, block, emit)),
        );
        messages.push({ role: 'user', content: results });
      }

      emit({ type: 'done' });
    } catch (err) {
      if (signal.aborted) {
        this.logger.log(`Discovery chat aborted by client [userId=${userId}]`);
      } else {
        this.logger.error(
          `Discovery chat failed [userId=${userId}]: ${err instanceof Error ? err.stack : String(err)}`,
        );
        emit({
          type: 'error',
          message: ONBOARDING_MESSAGES.ERROR.AI_UNAVAILABLE,
        });
      }
    } finally {
      await this.persistTurn(userId, message, reply);
      await this.redisService.del(chatLockKey(userId));
    }
  }

  private async runTool(
    userId: string,
    block: Anthropic.ToolUseBlock,
    emit: DiscoveryEmitter,
  ): Promise<Anthropic.ToolResultBlockParam> {
    const error = (content: string): Anthropic.ToolResultBlockParam => ({
      type: 'tool_result',
      tool_use_id: block.id,
      is_error: true,
      content,
    });

    if (block.name === SET_STARTING_POINT_TOOL) {
      const value = (block.input as { startingPoint?: unknown })?.startingPoint;
      if (typeof value !== 'string' || !STARTING_POINTS.has(value)) {
        return error(JSON.stringify({ INVALID_INPUT: block.input }));
      }
      const startingPoint = value as StartingPoint;
      await this.onboardingService.setStartingPoint(userId, startingPoint);
      emit({ type: 'starting_point', startingPoint });
      return { type: 'tool_result', tool_use_id: block.id, content: 'Saved.' };
    }

    const definition = SECTION_BY_TOOL.get(block.name);
    if (!definition) return error(`Unknown tool: ${block.name}`);

    const result = await this.onboardingService.applyAiSection(
      userId,
      definition.section,
      block.input,
    );
    if (!result.ok) return error(result.error);

    emit({ type: 'section', section: definition.section, data: result.value });
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      content:
        'Saved as a draft. The user can now review, edit and approve it in the side panel.',
    };
  }

  /**
   * Static guidance first (cached across all users), then this user's context.
   * Built once per turn so it stays byte-identical across the turn's tool loop.
   */
  private buildSystem(
    user: User,
    session: OnboardingSession,
  ): Anthropic.TextBlockParam[] {
    const country = user.country ? COUNTRY_CONFIG[user.country] : undefined;
    const registration = user.businessRegistration;
    const verifiedName =
      registration?.status === RegistrationVerificationStatus.VERIFIED
        ? registration.registeredName
        : undefined;

    const context = {
      firstName: user.firstName,
      country: country?.name ?? 'Unknown',
      currency: country?.currency ?? 'USD',
      registeredCompanyName: verifiedName ?? null,
      startingPoint: session.startingPoint ?? null,
      savedProfile: session.profile ?? {},
    };

    return [
      {
        type: 'text',
        text: DISCOVERY_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: `Current user context (JSON):\n${JSON.stringify(context)}`,
      },
    ];
  }

  private async persistTurn(
    userId: string,
    message: string,
    reply: string,
  ): Promise<void> {
    const now = new Date();
    const turns = [{ role: ChatRole.USER, content: message, createdAt: now }];
    if (reply) {
      turns.push({ role: ChatRole.ASSISTANT, content: reply, createdAt: now });
    }
    try {
      await this.sessionRepository.appendTurns(
        userId,
        turns,
        DISCOVERY_STORED_TURNS,
      );
    } catch (err) {
      this.logger.error(
        `Failed to persist discovery turn [userId=${userId}]: ${err instanceof Error ? err.stack : String(err)}`,
      );
    }
  }
}

/** Last N stored turns as text-only messages, starting on a user turn as the API requires. */
function toHistory(session: OnboardingSession): Anthropic.MessageParam[] {
  const recent = (session.messages ?? []).slice(-DISCOVERY_HISTORY_TURNS);
  const firstUser = recent.findIndex((t) => t.role === ChatRole.USER);
  if (firstUser === -1) return [];
  return recent.slice(firstUser).map((t) => ({
    role: t.role === ChatRole.USER ? 'user' : 'assistant',
    content: t.content,
  }));
}
