import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import {
  MongoDBContainer,
  StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Connection } from 'mongoose';
import { Server } from 'http';
import { createHmac } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app';
import { signRequest } from '../helpers/sign-request';
import { RedisService } from 'src/modules/redis/redis.service';
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';
import { BusinessCategoriesRepository } from 'src/modules/business-categories/business-categories.repository';
import { BUSINESS_CATEGORIES_MESSAGES } from 'src/common/constants/messages/business-categories.messages';

// ─── Response shape ───────────────────────────────────────────────────────────

interface ApiBody<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
}

interface CategoryItem {
  _id: string;
  name: string;
  slug: string;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('GET /api/business-categories (integration)', () => {
  let app: INestApplication;
  let clientToken: string;
  let dbConnection: Connection;
  let catModel: ReturnModelType<typeof BusinessCategory>;
  let redisService: RedisService;
  let repository: BusinessCategoriesRepository;

  let mongoContainer: StartedMongoDBContainer;
  let redisContainer: StartedTestContainer;

  const CACHE_KEY = 'business_categories:all';

  // ─── Setup ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    [mongoContainer, redisContainer] = await Promise.all([
      new MongoDBContainer('mongo:7').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    const databaseUrl =
      mongoContainer.getConnectionString() +
      '/servixos_test?directConnection=true';
    const redisUrl = `redis://localhost:${redisContainer.getMappedPort(6379)}`;

    ({ app } = await createTestApp({ databaseUrl, redisUrl }));

    const tokenRes = await request(app.getHttpServer() as Server).get(
      '/api/auth/client-token',
    );
    clientToken = (tokenRes.body as { data: { token: string } }).data.token;

    dbConnection = app.get<Connection>(getConnectionToken());
    catModel = getModelForClass(BusinessCategory, {
      existingConnection: dbConnection,
    });
    redisService = app.get<RedisService>(RedisService);
    repository = app.get<BusinessCategoriesRepository>(
      BusinessCategoriesRepository,
    );
  }, 300_000);

  afterAll(async () => {
    await app.close();
    await mongoContainer.stop();
    await redisContainer.stop();
  });

  beforeEach(async () => {
    await catModel.deleteMany({});
    await redisService.del(CACHE_KEY);
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function req() {
    return request(app.getHttpServer() as Server);
  }

  function authed(r: request.Test): request.Test {
    return signRequest(r, clientToken);
  }

  function seedCategories(
    docs: { name: string; slug: string; isActive?: boolean }[],
  ) {
    return catModel.insertMany(docs);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HMAC signature guard
  // ─────────────────────────────────────────────────────────────────────────────

  describe('HMAC signature guard', () => {
    it('returns 401 when HMAC headers are missing', async () => {
      // Arrange & Act
      const res = await req().get('/api/business-categories');
      // Assert
      expect(res.status).toBe(401);
    });

    it('returns 401 when the signature is invalid', async () => {
      // Arrange & Act
      const res = await req()
        .get('/api/business-categories')
        .set('x-client-token', clientToken)
        .set('x-timestamp', Date.now().toString())
        .set('x-signature', 'a'.repeat(64));
      // Assert
      expect(res.status).toBe(401);
    });

    it('returns 401 when the timestamp is stale', async () => {
      // Arrange — timestamp 10 minutes in the past
      const staleTs = (Date.now() - 10 * 60 * 1_000).toString();
      // Act
      const res = await req()
        .get('/api/business-categories')
        .set('x-client-token', clientToken)
        .set('x-timestamp', staleTs)
        .set('x-signature', 'anything');
      // Assert
      expect(res.status).toBe(401);
    });

    it('returns 401 when the client token is not found in Redis', async () => {
      // Arrange — fabricate a token that was never issued
      const fakeToken = 'b'.repeat(64);
      const timestamp = Date.now().toString();
      const canonical = ['GET', '/api/business-categories', timestamp, ''].join(
        '\n',
      );
      const sig = createHmac('sha256', fakeToken)
        .update(canonical)
        .digest('hex');
      // Act
      const res = await req()
        .get('/api/business-categories')
        .set('x-client-token', fakeToken)
        .set('x-timestamp', timestamp)
        .set('x-signature', sig);
      // Assert
      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Happy path
  // ─────────────────────────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('returns 200 with the standard success envelope', async () => {
      // Arrange
      await seedCategories([{ name: 'Cleaning', slug: 'cleaning' }]);
      // Act
      const res = await authed(req().get('/api/business-categories'));
      const body = res.body as ApiBody<CategoryItem[]>;
      // Assert
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.message).toBe(BUSINESS_CATEGORIES_MESSAGES.SUCCESS.RETRIEVED);
    });

    it('returns an array of active categories', async () => {
      // Arrange
      await seedCategories([
        { name: 'Cleaning', slug: 'cleaning' },
        { name: 'Plumbing', slug: 'plumbing' },
      ]);
      // Act
      const res = await authed(req().get('/api/business-categories'));
      const body = res.body as ApiBody<CategoryItem[]>;
      // Assert
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('returns an empty array when no active categories exist', async () => {
      // Arrange — nothing seeded
      // Act
      const res = await authed(req().get('/api/business-categories'));
      const body = res.body as ApiBody<CategoryItem[]>;
      // Assert
      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('each item contains only _id, name, and slug — no isActive or __v', async () => {
      // Arrange
      await seedCategories([{ name: 'Landscaping', slug: 'landscaping' }]);
      // Act
      const res = await authed(req().get('/api/business-categories'));
      const [item] = (res.body as ApiBody<CategoryItem[]>).data!;
      // Assert
      expect(item._id).toBeDefined();
      expect(item.name).toBe('Landscaping');
      expect(item.slug).toBe('landscaping');
      expect(Object.keys(item)).not.toContain('isActive');
      expect(Object.keys(item)).not.toContain('__v');
    });

    it('excludes inactive categories from the response', async () => {
      // Arrange
      await seedCategories([
        { name: 'Active Service', slug: 'active-service', isActive: true },
        { name: 'Inactive Service', slug: 'inactive-service', isActive: false },
      ]);
      // Act
      const res = await authed(req().get('/api/business-categories'));
      const body = res.body as ApiBody<CategoryItem[]>;
      // Assert
      expect(body.data).toHaveLength(1);
      expect(body.data![0].name).toBe('Active Service');
    });

    it('does not require Authorization or x-business-id (fully public endpoint)', async () => {
      // Arrange
      await seedCategories([{ name: 'Electrical', slug: 'electrical' }]);
      // Act — no Authorization, no x-business-id
      const res = await authed(req().get('/api/business-categories'));
      // Assert
      expect(res.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Caching
  // ─────────────────────────────────────────────────────────────────────────────

  describe('caching', () => {
    it('populates the Redis cache key after the first request', async () => {
      // Arrange
      await seedCategories([{ name: 'HVAC', slug: 'hvac' }]);
      // Act
      await authed(req().get('/api/business-categories'));
      // Assert
      const cached = await redisService.get(CACHE_KEY);
      expect(cached).not.toBeNull();
    });

    it('the cached value matches the response data', async () => {
      // Arrange
      await seedCategories([{ name: 'Carpentry', slug: 'carpentry' }]);
      // Act
      const res = await authed(req().get('/api/business-categories'));
      const cached = await redisService.get(CACHE_KEY);
      // Assert
      const parsedCache = JSON.parse(cached!) as CategoryItem[];
      expect(parsedCache[0].slug).toBe(
        (res.body as ApiBody<CategoryItem[]>).data![0].slug,
      );
    });

    it('hits the database only once and serves the second request from cache', async () => {
      // Arrange
      await seedCategories([{ name: 'Roofing', slug: 'roofing' }]);
      const spy = jest.spyOn(repository, 'findAll');
      // Act
      await authed(req().get('/api/business-categories'));
      await authed(req().get('/api/business-categories'));
      // Assert
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('serves stale data from cache even after a new category is inserted', async () => {
      // Arrange — first request populates cache with one category
      await seedCategories([{ name: 'Pest Control', slug: 'pest-control' }]);
      await authed(req().get('/api/business-categories'));

      // Insert a second category without clearing the cache
      await catModel.create({
        name: 'Window Cleaning',
        slug: 'window-cleaning',
        isActive: true,
      });

      // Act — second request should still return the cached single-item list
      const res = await authed(req().get('/api/business-categories'));
      const body = res.body as ApiBody<CategoryItem[]>;
      // Assert
      expect(body.data).toHaveLength(1);
    });

    it('reflects newly added categories after the cache is cleared', async () => {
      // Arrange — first request populates cache
      await seedCategories([{ name: 'Pool Service', slug: 'pool-service' }]);
      await authed(req().get('/api/business-categories'));
      await catModel.create({
        name: 'Snow Removal',
        slug: 'snow-removal',
        isActive: true,
      });

      // Act — clear cache, then re-request
      await redisService.del(CACHE_KEY);
      const res = await authed(req().get('/api/business-categories'));
      const body = res.body as ApiBody<CategoryItem[]>;
      // Assert
      expect(body.data).toHaveLength(2);
    });
  });
});
