import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import {
  MongoDBContainer,
  StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Connection, Types } from 'mongoose';
import { Server } from 'http';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app';
import { AgendaService } from 'src/modules/agenda/agenda.service';
import { JOBS } from 'src/modules/agenda/agenda.constants';
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';
import { Business } from 'src/modules/business/schemas/business.schema';
import {
  ServiceRequest,
  RequestStatus,
} from 'src/modules/requests/schemas/service-request.schema';
import { Client } from 'src/modules/clients/schemas/client.schema';
import { REQUESTS_MESSAGES } from 'src/common/constants/messages/requests.messages';

// ─── Response shapes ──────────────────────────────────────────────────────────

interface ApiBody<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface LoginPayload {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    businessId: string;
    subdomain?: string;
  };
}

interface EmailJobArgs {
  to: string;
  otp?: string;
}

// ─── Test constants ───────────────────────────────────────────────────────────

const BASE = '/api/requests';
const PHONE = '+12025550101';
const BUSINESS_DESC = 'Professional plumbing and pipe repair services.';

const SEEDED_USER = {
  firstName: 'Alice',
  lastName: 'Requests',
  email: 'alice@requests.test.local',
  phone: PHONE,
  password: 'Password123',
  pin: '1234',
};

const OTHER_USER = {
  firstName: 'Bob',
  lastName: 'Other',
  email: 'bob@requests.test.local',
  phone: PHONE,
  password: 'Password123',
  pin: '5678',
};

const BASE_REQUEST_BODY = {
  clientName: 'Mike Johnson',
  clientEmail: 'mike@test.local',
  clientPhone: '+12025550103',
  service: 'Pipe Repair',
  requestedDate: '2026-05-05',
  message: 'Burst pipe in kitchen',
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Requests (integration)', () => {
  let app: INestApplication;
  let apiKey: string;
  let dbConnection: Connection;
  let nowSpy: jest.Mock;

  let serviceRequestModel: ReturnModelType<typeof ServiceRequest>;
  let clientModel: ReturnModelType<typeof Client>;
  let businessModel: ReturnModelType<typeof Business>;

  let mongoContainer: StartedMongoDBContainer;
  let redisContainer: StartedTestContainer;

  const seededUser = { accessToken: '', businessId: '', subdomain: '' };
  const otherUser = { accessToken: '', businessId: '' };

  // ─── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    [mongoContainer, redisContainer] = await Promise.all([
      new MongoDBContainer('mongo:7').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    const databaseUrl =
      mongoContainer.getConnectionString() +
      '/servixos_requests_test?directConnection=true';
    const redisUrl = `redis://localhost:${redisContainer.getMappedPort(6379)}`;

    ({ app, apiKey } = await createTestApp({ databaseUrl, redisUrl }));

    dbConnection = app.get<Connection>(getConnectionToken());

    serviceRequestModel = getModelForClass(ServiceRequest, {
      existingConnection: dbConnection,
    });
    clientModel = getModelForClass(Client, {
      existingConnection: dbConnection,
    });
    businessModel = getModelForClass(Business, {
      existingConnection: dbConnection,
    });

    const mockAgenda = app.get<Record<string, jest.Mock>>(AgendaService);
    nowSpy = mockAgenda['now'];

    const catModel = getModelForClass(BusinessCategory, {
      existingConnection: dbConnection,
    });
    const cat = await catModel.create({
      name: 'Plumbing',
      slug: 'plumbing',
      isActive: true,
    });
    const categoryId = String(cat._id);

    const seededData = await fullOnboarding(SEEDED_USER, categoryId);
    seededUser.accessToken = seededData.accessToken;
    seededUser.businessId = seededData.user.businessId;
    seededUser.subdomain = seededData.user.subdomain!;

    const otherData = await fullOnboarding(OTHER_USER, categoryId);
    otherUser.accessToken = otherData.accessToken;
    otherUser.businessId = otherData.user.businessId;
  }, 300_000);

  afterAll(async () => {
    await app.close();
    await mongoContainer.stop();
    await redisContainer.stop();
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function req() {
    return request(app.getHttpServer() as Server);
  }

  function authed(r: request.Test): request.Test {
    return r.set('x-api-key', apiKey);
  }

  function asUser(
    r: request.Test,
    token: string,
    businessId: string,
  ): request.Test {
    return r
      .set('x-api-key', apiKey)
      .set('Authorization', `Bearer ${token}`)
      .set('x-business-id', businessId);
  }

  function asSeeded(r: request.Test): request.Test {
    return asUser(r, seededUser.accessToken, seededUser.businessId);
  }

  function captureOtpFor(email: string): string {
    const calls = nowSpy.mock.calls as [string, EmailJobArgs][];
    const match = [...calls]
      .reverse()
      .find((c) => c[0] === JOBS.EMAIL_VERIFICATION && c[1].to === email);
    if (!match?.[1].otp) throw new Error(`No OTP captured for ${email}`);
    return match[1].otp;
  }

  async function seedRequest(
    businessId: string,
    override: Partial<ServiceRequest> = {},
  ): Promise<ServiceRequest> {
    const [doc] = await serviceRequestModel.create([
      {
        businessId: new Types.ObjectId(businessId),
        clientName: 'Seeded Client',
        clientEmail: `seed-${Date.now()}-${Math.random()}@test.local`,
        clientPhone: '+12025550100',
        service: 'Seeded Service',
        requestedDate: new Date('2026-06-01'),
        message: 'Seeded message',
        status: RequestStatus.PENDING,
        ...override,
      },
    ]);
    return doc.toObject() as ServiceRequest;
  }

  async function fullOnboarding(
    user: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      password: string;
      pin: string;
    },
    categoryId: string,
  ): Promise<LoginPayload> {
    await authed(
      req().post('/api/auth/onboarding/account').send({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        password: user.password,
        confirmPassword: user.password,
      }),
    );

    const otp = captureOtpFor(user.email);

    await authed(
      req()
        .post('/api/auth/onboarding/verify-email')
        .send({ email: user.email, otp }),
    );

    await authed(
      req()
        .post('/api/auth/onboarding/set-pin')
        .send({ email: user.email, pin: user.pin, confirmPin: user.pin }),
    );

    const res = await authed(
      req()
        .post('/api/auth/onboarding/business')
        .send({
          email: user.email,
          businessName: `${user.firstName} Plumbing Co`,
          businessCategory: categoryId,
          businessDescription: BUSINESS_DESC,
          timezone: 'America/New_York',
        }),
    );

    return (res.body as ApiBody<LoginPayload>).data!;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/requests  (public)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/requests', () => {
    describe('API key guard', () => {
      it('returns 401 when x-api-key header is missing', async () => {
        // Arrange & Act
        const res = await req()
          .post(BASE)
          .query({ businessId: seededUser.businessId })
          .send(BASE_REQUEST_BODY);
        // Assert
        expect(res.status).toBe(401);
      });

      it('returns 401 when x-api-key is invalid', async () => {
        // Arrange & Act
        const res = await req()
          .post(BASE)
          .set('x-api-key', 'wrong-key')
          .query({ businessId: seededUser.businessId })
          .send(BASE_REQUEST_BODY);
        // Assert
        expect(res.status).toBe(401);
      });
    });

    describe('input validation — 400', () => {
      it.each<[string, Partial<typeof BASE_REQUEST_BODY>]>([
        ['clientName', { clientName: undefined }],
        ['clientEmail', { clientEmail: undefined }],
        ['service', { service: undefined }],
        ['requestedDate', { requestedDate: undefined }],
      ])('returns 400 when %s is missing', async (_field, override) => {
        // Arrange
        const body = { ...BASE_REQUEST_BODY, ...override };
        // Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessId: seededUser.businessId })
            .send(body),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when clientEmail is not a valid email address', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessId: seededUser.businessId })
            .send({ ...BASE_REQUEST_BODY, clientEmail: 'not-an-email' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when requestedDate is not a valid ISO date string', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessId: seededUser.businessId })
            .send({ ...BASE_REQUEST_BODY, requestedDate: 'not-a-date' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('business resolution', () => {
      it('returns 400 when neither businessSlug nor businessId is provided', async () => {
        // Arrange & Act
        const res = await authed(req().post(BASE).send(BASE_REQUEST_BODY));
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 404 when businessId does not match any business', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessId: new Types.ObjectId().toString() })
            .send(BASE_REQUEST_BODY),
        );
        // Assert
        expect(res.status).toBe(404);
      });

      it('returns 404 when businessSlug does not match any subdomain', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessSlug: 'no-such-subdomain-xyz' })
            .send(BASE_REQUEST_BODY),
        );
        // Assert
        expect(res.status).toBe(404);
      });

      it('returns 404 when the business resolved by businessId is soft-deleted', async () => {
        // Arrange
        const bId = new Types.ObjectId(seededUser.businessId);
        await businessModel.updateOne(
          { _id: bId },
          { $set: { deletedAt: new Date() } },
        );
        // Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessId: seededUser.businessId })
            .send(BASE_REQUEST_BODY),
        );
        // Restore
        await businessModel.updateOne(
          { _id: bId },
          { $unset: { deletedAt: '' } },
        );
        // Assert
        expect(res.status).toBe(404);
      });
    });

    describe('happy path', () => {
      it('returns 201 with the created request when businessId query param is used', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessId: seededUser.businessId })
            .send(BASE_REQUEST_BODY),
        );
        // Assert
        expect(res.status).toBe(201);
        expect((res.body as ApiBody).success).toBe(true);
        expect((res.body as ApiBody).message).toBe(
          REQUESTS_MESSAGES.SUCCESS.CREATED,
        );
      });

      it('returns 201 with the created request when businessSlug query param is used', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessSlug: seededUser.subdomain })
            .send(BASE_REQUEST_BODY),
        );
        // Assert
        expect(res.status).toBe(201);
      });

      it('creates the request with status pending by default', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessId: seededUser.businessId })
            .send(BASE_REQUEST_BODY),
        );
        // Assert
        const data = (res.body as ApiBody<{ status: string }>).data!;
        expect(data.status).toBe(RequestStatus.PENDING);
      });

      it('persists the request in the database with the correct businessId', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessId: seededUser.businessId })
            .send(BASE_REQUEST_BODY),
        );
        const id = (res.body as ApiBody<{ _id: string }>).data!._id;
        const stored = await serviceRequestModel
          .findById(id)
          .lean<ServiceRequest>();
        // Assert
        expect(stored).not.toBeNull();
        expect(stored!.businessId.toString()).toBe(seededUser.businessId);
      });

      it('stores requestedDate as a Date object, not the raw input string', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessId: seededUser.businessId })
            .send(BASE_REQUEST_BODY),
        );
        const id = (res.body as ApiBody<{ _id: string }>).data!._id;
        const stored = await serviceRequestModel
          .findById(id)
          .lean<ServiceRequest>();
        // Assert
        expect(stored!.requestedDate).toBeInstanceOf(Date);
      });

      it('omits clientPhone and message when not provided', async () => {
        // Arrange
        const body = {
          clientName: BASE_REQUEST_BODY.clientName,
          clientEmail: BASE_REQUEST_BODY.clientEmail,
          service: BASE_REQUEST_BODY.service,
          requestedDate: BASE_REQUEST_BODY.requestedDate,
        };
        // Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessId: seededUser.businessId })
            .send(body),
        );
        const id = (res.body as ApiBody<{ _id: string }>).data!._id;
        const stored = await serviceRequestModel
          .findById(id)
          .lean<ServiceRequest>();
        // Assert
        expect(res.status).toBe(201);
        expect(stored!.clientPhone).toBeUndefined();
        expect(stored!.message).toBeUndefined();
      });

      it('normalises clientEmail to lowercase', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post(BASE)
            .query({ businessId: seededUser.businessId })
            .send({ ...BASE_REQUEST_BODY, clientEmail: 'UPPER@TEST.LOCAL' }),
        );
        // Assert
        const data = (res.body as ApiBody<{ clientEmail: string }>).data!;
        expect(data.clientEmail).toBe('upper@test.local');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/requests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /api/requests', () => {
    describe('auth guard', () => {
      it('returns 401 when x-api-key header is missing', async () => {
        // Arrange & Act
        const res = await req()
          .get(BASE)
          .set('Authorization', `Bearer ${seededUser.accessToken}`)
          .set('x-business-id', seededUser.businessId);
        // Assert
        expect(res.status).toBe(401);
      });

      it('returns 401 when Authorization header is missing', async () => {
        // Arrange & Act
        const res = await req()
          .get(BASE)
          .set('x-api-key', apiKey)
          .set('x-business-id', seededUser.businessId);
        // Assert
        expect(res.status).toBe(401);
      });

      it('returns 401 when the JWT is invalid', async () => {
        // Arrange & Act
        const res = await req()
          .get(BASE)
          .set('x-api-key', apiKey)
          .set('Authorization', 'Bearer invalid.jwt.token')
          .set('x-business-id', seededUser.businessId);
        // Assert
        expect(res.status).toBe(401);
      });
    });

    describe('happy path', () => {
      it('returns 200 with an array of requests and pagination meta', async () => {
        // Arrange
        await seedRequest(seededUser.businessId);
        // Act
        const res = await asSeeded(req().get(BASE));
        const body = res.body as ApiBody<ServiceRequest[]>;
        // Assert
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.message).toBe(REQUESTS_MESSAGES.SUCCESS.RETRIEVED);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.meta).toMatchObject({
          page: expect.any(Number) as unknown,
          limit: expect.any(Number) as unknown,
          total: expect.any(Number) as unknown,
          totalPages: expect.any(Number) as unknown,
        });
      });

      it('does not return requests belonging to a different business', async () => {
        // Arrange — seed a request for the other business
        await seedRequest(otherUser.businessId, {
          clientEmail: 'isolation-check@other.test.local',
        });
        // Act
        const res = await asSeeded(req().get(BASE));
        const data = (res.body as ApiBody<Array<{ businessId: string }>>).data!;
        // Assert
        const leaked = data.some((r) => r.businessId === otherUser.businessId);
        expect(leaked).toBe(false);
      });

      it('does not return soft-deleted requests', async () => {
        // Arrange
        const deleted = await seedRequest(seededUser.businessId, {
          deletedAt: new Date(),
        });
        // Act
        const res = await asSeeded(req().get(BASE));
        const data = (res.body as ApiBody<Array<{ _id: string }>>).data!;
        // Assert
        const found = data.some((r) => r._id === deleted._id.toString());
        expect(found).toBe(false);
      });
    });

    describe('filters', () => {
      it('returns only requests matching the given status', async () => {
        // Arrange
        await seedRequest(seededUser.businessId, {
          clientEmail: 'filter-accepted@test.local',
          status: RequestStatus.ACCEPTED,
        });
        await seedRequest(seededUser.businessId, {
          clientEmail: 'filter-pending@test.local',
          status: RequestStatus.PENDING,
        });
        // Act
        const res = await asSeeded(
          req().get(BASE).query({ status: RequestStatus.ACCEPTED }),
        );
        const data = (res.body as ApiBody<Array<{ status: string }>>).data!;
        // Assert
        expect(data.length).toBeGreaterThan(0);
        expect(
          data.every((r) => r.status === (RequestStatus.ACCEPTED as string)),
        ).toBe(true);
      });

      it('matches search against clientName (case-insensitive)', async () => {
        // Arrange
        await seedRequest(seededUser.businessId, {
          clientName: 'SearchableNameXYZ123',
          clientEmail: 'search-name@test.local',
        });
        // Act
        const res = await asSeeded(
          req().get(BASE).query({ search: 'searchablenamexyz123' }),
        );
        const data = (res.body as ApiBody<Array<{ clientName: string }>>).data!;
        // Assert
        expect(data.some((r) => r.clientName === 'SearchableNameXYZ123')).toBe(
          true,
        );
      });

      it('matches search against clientEmail', async () => {
        // Arrange
        const uniqueEmail = 'uniquequery456@test.local';
        await seedRequest(seededUser.businessId, { clientEmail: uniqueEmail });
        // Act
        const res = await asSeeded(
          req().get(BASE).query({ search: 'uniquequery456' }),
        );
        const data = (res.body as ApiBody<Array<{ clientEmail: string }>>)
          .data!;
        // Assert
        expect(data.some((r) => r.clientEmail === uniqueEmail)).toBe(true);
      });

      it('matches search against the service field', async () => {
        // Arrange
        await seedRequest(seededUser.businessId, {
          clientEmail: 'search-service@test.local',
          service: 'BoilerInspectionZZZZ',
        });
        // Act
        const res = await asSeeded(
          req().get(BASE).query({ search: 'boilerinspectionzzzz' }),
        );
        const data = (res.body as ApiBody<Array<{ service: string }>>).data!;
        // Assert
        expect(data.some((r) => r.service === 'BoilerInspectionZZZZ')).toBe(
          true,
        );
      });
    });

    describe('pagination', () => {
      it('respects the page and limit query params', async () => {
        // Arrange & Act
        const res = await asSeeded(
          req().get(BASE).query({ page: 1, limit: 2 }),
        );
        const body = res.body as ApiBody<unknown[]>;
        // Assert
        expect(body.meta?.page).toBe(1);
        expect(body.meta?.limit).toBe(2);
        expect(body.data!.length).toBeLessThanOrEqual(2);
      });

      it('totalPages equals ceiling of total divided by limit', async () => {
        // Arrange & Act
        const res = await asSeeded(req().get(BASE).query({ limit: 1 }));
        const { meta } = res.body as ApiBody;
        // Assert
        expect(meta!.totalPages).toBe(Math.ceil(meta!.total / meta!.limit));
      });

      it('page 2 returns a different set of results than page 1', async () => {
        // Arrange — ensure at least 2 docs exist
        await seedRequest(seededUser.businessId);
        await seedRequest(seededUser.businessId);
        // Act
        const [page1, page2] = await Promise.all([
          asSeeded(req().get(BASE).query({ page: 1, limit: 1 })),
          asSeeded(req().get(BASE).query({ page: 2, limit: 1 })),
        ]);
        const ids1 = (page1.body as ApiBody<Array<{ _id: string }>>).data!.map(
          (r) => r._id,
        );
        const ids2 = (page2.body as ApiBody<Array<{ _id: string }>>).data!.map(
          (r) => r._id,
        );
        // Assert
        expect(ids1.some((id) => ids2.includes(id))).toBe(false);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/requests/:id
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /api/requests/:id', () => {
    describe('auth guard', () => {
      it('returns 401 when Authorization header is missing', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId);
        // Act
        const res = await req()
          .get(`${BASE}/${doc._id.toString()}`)
          .set('x-api-key', apiKey)
          .set('x-business-id', seededUser.businessId);
        // Assert
        expect(res.status).toBe(401);
      });
    });

    describe('happy path', () => {
      it('returns 200 with the correct request document', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId);
        // Act
        const res = await asSeeded(req().get(`${BASE}/${doc._id.toString()}`));
        // Assert
        expect(res.status).toBe(200);
        expect((res.body as ApiBody).message).toBe(
          REQUESTS_MESSAGES.SUCCESS.FOUND,
        );
        expect((res.body as ApiBody<{ _id: string }>).data?._id).toBe(
          doc._id.toString(),
        );
      });
    });

    describe('error cases', () => {
      it('returns 404 with NOT_FOUND message when the request does not exist', async () => {
        // Arrange & Act
        const res = await asSeeded(
          req().get(`${BASE}/${new Types.ObjectId().toString()}`),
        );
        // Assert
        expect(res.status).toBe(404);
        expect((res.body as ApiBody).message).toBe(
          REQUESTS_MESSAGES.ERROR.NOT_FOUND,
        );
      });

      it('returns 404 when the request belongs to a different business', async () => {
        // Arrange
        const doc = await seedRequest(otherUser.businessId);
        // Act — seeded user attempts to read other business's request
        const res = await asSeeded(req().get(`${BASE}/${doc._id.toString()}`));
        // Assert
        expect(res.status).toBe(404);
      });

      it('returns 404 when the request has been soft-deleted', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId, {
          deletedAt: new Date(),
        });
        // Act
        const res = await asSeeded(req().get(`${BASE}/${doc._id.toString()}`));
        // Assert
        expect(res.status).toBe(404);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH /api/requests/:id
  // ─────────────────────────────────────────────────────────────────────────────

  describe('PATCH /api/requests/:id', () => {
    describe('auth guard', () => {
      it('returns 401 when Authorization header is missing', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId);
        // Act
        const res = await req()
          .patch(`${BASE}/${doc._id.toString()}`)
          .set('x-api-key', apiKey)
          .set('x-business-id', seededUser.businessId)
          .send({ status: RequestStatus.REJECTED });
        // Assert
        expect(res.status).toBe(401);
      });
    });

    describe('error cases', () => {
      it('returns 404 when the request does not exist', async () => {
        // Arrange & Act
        const res = await asSeeded(
          req()
            .patch(`${BASE}/${new Types.ObjectId().toString()}`)
            .send({ status: RequestStatus.REJECTED }),
        );
        // Assert
        expect(res.status).toBe(404);
        expect((res.body as ApiBody).message).toBe(
          REQUESTS_MESSAGES.ERROR.NOT_FOUND,
        );
      });

      it('returns 404 when the request belongs to a different business', async () => {
        // Arrange
        const doc = await seedRequest(otherUser.businessId);
        // Act
        const res = await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ status: RequestStatus.REJECTED }),
        );
        // Assert
        expect(res.status).toBe(404);
      });

      it('returns 400 with ALREADY_ACTIONED when status is changed on a non-pending request', async () => {
        // Arrange — seed a request that is already accepted
        const doc = await seedRequest(seededUser.businessId, {
          status: RequestStatus.ACCEPTED,
        });
        // Act
        const res = await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ status: RequestStatus.REJECTED }),
        );
        // Assert
        expect(res.status).toBe(400);
        expect((res.body as ApiBody).message).toBe(
          REQUESTS_MESSAGES.ERROR.ALREADY_ACTIONED,
        );
      });

      it.each<RequestStatus>([
        RequestStatus.REJECTED,
        RequestStatus.CANCELLED,
        RequestStatus.ACCEPTED,
      ])(
        'returns 400 with ALREADY_ACTIONED when request is already "%s"',
        async (existingStatus) => {
          // Arrange
          const doc = await seedRequest(seededUser.businessId, {
            status: existingStatus,
          });
          // Act
          const res = await asSeeded(
            req()
              .patch(`${BASE}/${doc._id.toString()}`)
              .send({ status: RequestStatus.CANCELLED }),
          );
          // Assert
          expect(res.status).toBe(400);
        },
      );
    });

    describe('status transition — reject', () => {
      it('sets status to rejected, records actionedAt and actionedBy', async () => {
        // Arrange
        const before = Date.now();
        const doc = await seedRequest(seededUser.businessId);
        // Act
        const res = await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ status: RequestStatus.REJECTED }),
        );
        const stored = await serviceRequestModel
          .findById(doc._id)
          .lean<ServiceRequest>();
        // Assert
        expect(res.status).toBe(200);
        expect(stored!.status).toBe(RequestStatus.REJECTED);
        expect(stored!.actionedAt!.getTime()).toBeGreaterThanOrEqual(before);
        expect(stored!.actionedBy).toBeDefined();
      });
    });

    describe('status transition — cancel', () => {
      it('sets status to cancelled', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId);
        // Act
        const res = await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ status: RequestStatus.CANCELLED }),
        );
        const stored = await serviceRequestModel
          .findById(doc._id)
          .lean<ServiceRequest>();
        // Assert
        expect(res.status).toBe(200);
        expect(stored!.status).toBe(RequestStatus.CANCELLED);
      });
    });

    describe('status transition — accept', () => {
      it('creates a new Client document when none exists for that email in the business', async () => {
        // Arrange
        const email = `new-client-${Date.now()}@accept.test.local`;
        const doc = await seedRequest(seededUser.businessId, {
          clientEmail: email,
          clientName: 'Accept Client',
        });
        // Act
        const res = await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ status: RequestStatus.ACCEPTED }),
        );
        const client = await clientModel
          .findOne({
            email,
            businessId: new Types.ObjectId(seededUser.businessId),
          })
          .lean<Client>();
        // Assert
        expect(res.status).toBe(200);
        expect(client).not.toBeNull();
        expect(client!.name).toBe('Accept Client');
      });

      it('links the resolved clientId back to the ServiceRequest', async () => {
        // Arrange
        const email = `linked-${Date.now()}@accept.test.local`;
        const doc = await seedRequest(seededUser.businessId, {
          clientEmail: email,
        });
        // Act
        await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ status: RequestStatus.ACCEPTED }),
        );
        const stored = await serviceRequestModel
          .findById(doc._id)
          .lean<ServiceRequest>();
        const client = await clientModel.findOne({ email }).lean<Client>();
        // Assert
        expect(stored!.clientId?.toString()).toBe(client!._id.toString());
      });

      it('reuses an existing Client — no duplicate is created', async () => {
        // Arrange — pre-create the client record
        const email = `existing-${Date.now()}@accept.test.local`;
        const [existingClient] = await clientModel.create([
          {
            businessId: new Types.ObjectId(seededUser.businessId),
            name: 'Pre-existing Client',
            email,
          },
        ]);
        const doc = await seedRequest(seededUser.businessId, {
          clientEmail: email,
        });
        // Act
        await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ status: RequestStatus.ACCEPTED }),
        );
        const clientCount = await clientModel.countDocuments({
          email,
          businessId: new Types.ObjectId(seededUser.businessId),
        });
        const stored = await serviceRequestModel
          .findById(doc._id)
          .lean<ServiceRequest>();
        // Assert — still exactly one client, linked to the pre-existing one
        expect(clientCount).toBe(1);
        expect(stored!.clientId?.toString()).toBe(
          existingClient._id.toString(),
        );
      });

      it('stores quotedPrice on the request when provided alongside accepted status', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId, {
          clientEmail: `quoted-${Date.now()}@accept.test.local`,
        });
        // Act
        await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ status: RequestStatus.ACCEPTED, quotedPrice: 450.0 }),
        );
        const stored = await serviceRequestModel
          .findById(doc._id)
          .lean<ServiceRequest>();
        // Assert
        expect(stored!.quotedPrice).toBe(450.0);
      });

      it('sets actionedAt and actionedBy on the accepted request', async () => {
        // Arrange
        const before = Date.now();
        const doc = await seedRequest(seededUser.businessId, {
          clientEmail: `actioned-${Date.now()}@accept.test.local`,
        });
        // Act
        await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ status: RequestStatus.ACCEPTED }),
        );
        const stored = await serviceRequestModel
          .findById(doc._id)
          .lean<ServiceRequest>();
        // Assert
        expect(stored!.actionedAt!.getTime()).toBeGreaterThanOrEqual(before);
        expect(stored!.actionedBy).toBeDefined();
      });

      it('sets status to accepted in the database', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId, {
          clientEmail: `status-check-${Date.now()}@accept.test.local`,
        });
        // Act
        await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ status: RequestStatus.ACCEPTED }),
        );
        const stored = await serviceRequestModel
          .findById(doc._id)
          .lean<ServiceRequest>();
        // Assert
        expect(stored!.status).toBe(RequestStatus.ACCEPTED);
      });
    });

    describe('quotedPrice update only', () => {
      it('updates quotedPrice without changing the request status', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId);
        // Act
        const res = await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ quotedPrice: 200 }),
        );
        const stored = await serviceRequestModel
          .findById(doc._id)
          .lean<ServiceRequest>();
        // Assert
        expect(res.status).toBe(200);
        expect(stored!.quotedPrice).toBe(200);
        expect(stored!.status).toBe(RequestStatus.PENDING);
      });

      it('returns 200 with the UPDATED message', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId);
        // Act
        const res = await asSeeded(
          req()
            .patch(`${BASE}/${doc._id.toString()}`)
            .send({ quotedPrice: 350 }),
        );
        // Assert
        expect((res.body as ApiBody).message).toBe(
          REQUESTS_MESSAGES.SUCCESS.UPDATED,
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE /api/requests/:id
  // ─────────────────────────────────────────────────────────────────────────────

  describe('DELETE /api/requests/:id', () => {
    describe('auth guard', () => {
      it('returns 401 when Authorization header is missing', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId);
        // Act
        const res = await req()
          .delete(`${BASE}/${doc._id.toString()}`)
          .set('x-api-key', apiKey)
          .set('x-business-id', seededUser.businessId);
        // Assert
        expect(res.status).toBe(401);
      });
    });

    describe('happy path', () => {
      it('returns 200 with the DELETED message and data: null', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId);
        // Act
        const res = await asSeeded(
          req().delete(`${BASE}/${doc._id.toString()}`),
        );
        // Assert
        expect(res.status).toBe(200);
        expect((res.body as ApiBody).message).toBe(
          REQUESTS_MESSAGES.SUCCESS.DELETED,
        );
        expect((res.body as ApiBody).data).toBeNull();
      });

      it('sets deletedAt on the document in the database', async () => {
        // Arrange
        const before = Date.now();
        const doc = await seedRequest(seededUser.businessId);
        // Act
        await asSeeded(req().delete(`${BASE}/${doc._id.toString()}`));
        const stored = await serviceRequestModel
          .findById(doc._id)
          .lean<ServiceRequest>();
        // Assert
        expect(stored!.deletedAt).toBeDefined();
        expect(stored!.deletedAt!.getTime()).toBeGreaterThanOrEqual(before);
      });

      it('makes the deleted request invisible to subsequent GET /:id calls', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId);
        await asSeeded(req().delete(`${BASE}/${doc._id.toString()}`));
        // Act
        const res = await asSeeded(req().get(`${BASE}/${doc._id.toString()}`));
        // Assert
        expect(res.status).toBe(404);
      });
    });

    describe('error cases', () => {
      it('returns 404 when the request does not exist', async () => {
        // Arrange & Act
        const res = await asSeeded(
          req().delete(`${BASE}/${new Types.ObjectId().toString()}`),
        );
        // Assert
        expect(res.status).toBe(404);
        expect((res.body as ApiBody).message).toBe(
          REQUESTS_MESSAGES.ERROR.NOT_FOUND,
        );
      });

      it('returns 404 when the request belongs to a different business', async () => {
        // Arrange
        const doc = await seedRequest(otherUser.businessId);
        // Act
        const res = await asSeeded(
          req().delete(`${BASE}/${doc._id.toString()}`),
        );
        // Assert
        expect(res.status).toBe(404);
      });

      it('returns 404 when the request is already soft-deleted', async () => {
        // Arrange
        const doc = await seedRequest(seededUser.businessId, {
          deletedAt: new Date(),
        });
        // Act
        const res = await asSeeded(
          req().delete(`${BASE}/${doc._id.toString()}`),
        );
        // Assert
        expect(res.status).toBe(404);
      });
    });
  });
});
