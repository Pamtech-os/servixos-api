import { ConfigService } from '@nestjs/config';
import { asMock } from 'test/helpers/mock';
import { RedisService } from 'src/modules/redis/services/redis.service';

interface MockRedisClient {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  scan: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
  ttl: jest.Mock;
  sadd: jest.Mock;
  srem: jest.Mock;
  smembers: jest.Mock;
  sismember: jest.Mock;
  hset: jest.Mock;
  hdel: jest.Mock;
  hgetall: jest.Mock;
  quit: jest.Mock;
}

describe('RedisService', () => {
  let service: RedisService;
  let mockClient: MockRedisClient;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      scan: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      smembers: jest.fn(),
      sismember: jest.fn(),
      hset: jest.fn(),
      hdel: jest.fn(),
      hgetall: jest.fn(),
      quit: jest.fn().mockResolvedValue(undefined),
    };

    service = new RedisService(asMock<ConfigService>({}));
    (service as unknown as { client: typeof mockClient }).client = mockClient;
  });

  // ─── get ───────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('should return the stored value for an existing key', async () => {
      // Arrange
      mockClient.get.mockResolvedValue('cached-data');

      // Act
      const result = await service.get('my-key');

      // Assert
      expect(result).toBe('cached-data');
      expect(mockClient.get).toHaveBeenCalledWith('my-key');
    });

    it('should return null when the key does not exist', async () => {
      // Arrange
      mockClient.get.mockResolvedValue(null);

      // Act
      const result = await service.get('missing-key');

      // Assert
      expect(result).toBeNull();
    });
  });

  // ─── set ───────────────────────────────────────────────────────────────────

  describe('set', () => {
    it('should call set with EX flag when ttlSeconds is provided', async () => {
      // Arrange
      mockClient.set.mockResolvedValue('OK');

      // Act
      await service.set('key', 'value', 60);

      // Assert
      expect(mockClient.set).toHaveBeenCalledWith('key', 'value', 'EX', 60);
    });

    it('should call set without TTL when ttlSeconds is omitted', async () => {
      // Arrange
      mockClient.set.mockResolvedValue('OK');

      // Act
      await service.set('key', 'value');

      // Assert
      expect(mockClient.set).toHaveBeenCalledWith('key', 'value');
    });
  });

  // ─── setIfAbsent ───────────────────────────────────────────────────────────

  describe('setIfAbsent', () => {
    it('should return true when NX set succeeds (key did not exist)', async () => {
      // Arrange
      mockClient.set.mockResolvedValue('OK');

      // Act
      const result = await service.setIfAbsent('lock-key', '1', 30);

      // Assert
      expect(result).toBe(true);
      expect(mockClient.set).toHaveBeenCalledWith(
        'lock-key',
        '1',
        'EX',
        30,
        'NX',
      );
    });

    it('should return false when NX set fails (key already exists)', async () => {
      // Arrange
      mockClient.set.mockResolvedValue(null);

      // Act
      const result = await service.setIfAbsent('lock-key', '1', 30);

      // Assert
      expect(result).toBe(false);
    });

    it('should use NX without EX when no ttlSeconds is given', async () => {
      // Arrange
      mockClient.set.mockResolvedValue('OK');

      // Act
      await service.setIfAbsent('key', 'val');

      // Assert
      expect(mockClient.set).toHaveBeenCalledWith('key', 'val', 'NX');
    });
  });

  // ─── del ───────────────────────────────────────────────────────────────────

  describe('del', () => {
    it('should delete the specified key', async () => {
      // Arrange
      mockClient.del.mockResolvedValue(1);

      // Act
      await service.del('stale-key');

      // Assert
      expect(mockClient.del).toHaveBeenCalledWith('stale-key');
    });
  });

  // ─── delByPattern ──────────────────────────────────────────────────────────

  describe('delByPattern', () => {
    it('should scan pages and delete all matching keys', async () => {
      // Arrange — first page returns 2 keys, second ends the cursor loop
      mockClient.scan
        .mockResolvedValueOnce(['42', ['key:a', 'key:b']])
        .mockResolvedValueOnce(['0', []]);
      mockClient.del.mockResolvedValue(2);

      // Act
      const deleted = await service.delByPattern('key:*');

      // Assert
      expect(deleted).toBe(2);
      expect(mockClient.del).toHaveBeenCalledWith('key:a', 'key:b');
    });

    it('should return 0 without calling del when no keys match', async () => {
      // Arrange
      mockClient.scan.mockResolvedValue(['0', []]);

      // Act
      const deleted = await service.delByPattern('nonexistent:*');

      // Assert
      expect(deleted).toBe(0);
      expect(mockClient.del).not.toHaveBeenCalled();
    });

    it('should accumulate counts across multiple scan pages', async () => {
      // Arrange
      mockClient.scan
        .mockResolvedValueOnce(['5', ['a:1', 'a:2']])
        .mockResolvedValueOnce(['0', ['a:3']]);
      mockClient.del.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      // Act
      const deleted = await service.delByPattern('a:*');

      // Assert
      expect(deleted).toBe(3);
    });
  });

  // ─── incr ──────────────────────────────────────────────────────────────────

  describe('incr', () => {
    it('should return the incremented integer value', async () => {
      // Arrange
      mockClient.incr.mockResolvedValue(7);

      // Act
      const result = await service.incr('counter');

      // Assert
      expect(result).toBe(7);
      expect(mockClient.incr).toHaveBeenCalledWith('counter');
    });
  });

  // ─── expire ────────────────────────────────────────────────────────────────

  describe('expire', () => {
    it('should set the TTL on a key', async () => {
      // Arrange
      mockClient.expire.mockResolvedValue(1);

      // Act
      await service.expire('cache-key', 300);

      // Assert
      expect(mockClient.expire).toHaveBeenCalledWith('cache-key', 300);
    });
  });

  // ─── ttl ───────────────────────────────────────────────────────────────────

  describe('ttl', () => {
    it('should return the remaining time-to-live in seconds', async () => {
      // Arrange
      mockClient.ttl.mockResolvedValue(120);

      // Act
      const result = await service.ttl('cache-key');

      // Assert
      expect(result).toBe(120);
    });
  });

  // ─── Set operations ────────────────────────────────────────────────────────

  describe('sadd', () => {
    it('should add one or more members to a set', async () => {
      // Arrange
      mockClient.sadd.mockResolvedValue(2);

      // Act
      await service.sadd('presence:biz1', 'user1', 'user2');

      // Assert
      expect(mockClient.sadd).toHaveBeenCalledWith(
        'presence:biz1',
        'user1',
        'user2',
      );
    });
  });

  describe('srem', () => {
    it('should remove one or more members from a set', async () => {
      // Arrange
      mockClient.srem.mockResolvedValue(1);

      // Act
      await service.srem('presence:biz1', 'user1');

      // Assert
      expect(mockClient.srem).toHaveBeenCalledWith('presence:biz1', 'user1');
    });
  });

  describe('smembers', () => {
    it('should return all members of a set', async () => {
      // Arrange
      mockClient.smembers.mockResolvedValue(['user1', 'user2', 'user3']);

      // Act
      const result = await service.smembers('presence:biz1');

      // Assert
      expect(result).toEqual(['user1', 'user2', 'user3']);
    });
  });

  describe('sismember', () => {
    it('should return true when the member exists in the set', async () => {
      // Arrange
      mockClient.sismember.mockResolvedValue(1);

      // Act
      const result = await service.sismember('presence:biz1', 'user1');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when the member is not in the set', async () => {
      // Arrange
      mockClient.sismember.mockResolvedValue(0);

      // Act
      const result = await service.sismember('presence:biz1', 'unknown-user');

      // Assert
      expect(result).toBe(false);
    });
  });

  // ─── Hash operations ───────────────────────────────────────────────────────

  describe('hset', () => {
    it('should set a field value in a hash', async () => {
      // Arrange
      mockClient.hset.mockResolvedValue(1);

      // Act
      await service.hset('meta:biz1', 'userId', 'abc');

      // Assert
      expect(mockClient.hset).toHaveBeenCalledWith(
        'meta:biz1',
        'userId',
        'abc',
      );
    });
  });

  describe('hdel', () => {
    it('should delete a field from a hash', async () => {
      // Arrange
      mockClient.hdel.mockResolvedValue(1);

      // Act
      await service.hdel('meta:biz1', 'userId');

      // Assert
      expect(mockClient.hdel).toHaveBeenCalledWith('meta:biz1', 'userId');
    });
  });

  describe('hgetall', () => {
    it('should return all fields and values from a hash', async () => {
      // Arrange
      mockClient.hgetall.mockResolvedValue({ field1: 'val1', field2: 'val2' });

      // Act
      const result = await service.hgetall('meta:biz1');

      // Assert
      expect(result).toEqual({ field1: 'val1', field2: 'val2' });
    });
  });

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  describe('onModuleDestroy', () => {
    it('should quit the Redis client on module teardown', () => {
      // Arrange — client already set via beforeEach

      // Act
      service.onModuleDestroy();

      // Assert
      expect(mockClient.quit).toHaveBeenCalled();
    });
  });
});
