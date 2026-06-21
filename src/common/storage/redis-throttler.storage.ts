import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from 'src/modules/redis/services/redis.service';

/**
 * Redis-backed ThrottlerStorage for distributed rate limiting across instances.
 * Uses INCR + EXPIRE for atomic per-window counting.
 * ttl and blockDuration from the guard are in milliseconds; Redis EXPIRE takes seconds.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttlMs: number,
    limit: number,
    blockDurationMs: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const countKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:block:${throttlerName}:${key}`;
    const ttlSecs = Math.ceil(ttlMs / 1000);

    // Check if IP is currently blocked
    const blockTtl = await this.redis.ttl(blockKey);
    if (blockTtl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: blockTtl,
      };
    }

    // Atomic hit counter — INCR is O(1) and safe under concurrency
    const totalHits = await this.redis.incr(countKey);
    if (totalHits === 1) {
      // Set the sliding window TTL only on the first hit so subsequent
      // increments within the window don't reset the expiry.
      await this.redis.expire(countKey, ttlSecs);
    }
    const timeToExpire = await this.redis.ttl(countKey);

    // Block the key once the limit is exceeded for the duration of blockDuration
    if (totalHits > limit && blockDurationMs > 0) {
      const blockSecs = Math.ceil(blockDurationMs / 1000);
      await this.redis.set(blockKey, '1', blockSecs);
      return {
        totalHits,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: blockSecs,
      };
    }

    return {
      totalHits,
      timeToExpire: Math.max(timeToExpire, 0),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
