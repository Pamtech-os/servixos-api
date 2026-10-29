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
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app';
import { signRequest } from '../helpers/sign-request';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { JOBS } from 'src/common/constants/agenda.constants';
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';
import { STAFF_MESSAGES } from 'src/common/constants/messages/staff.messages';
import { TIME_TRACKING_MESSAGES } from 'src/common/constants/messages/time-tracking.messages';
import { ClockStatus } from 'src/modules/employees/schemas/clock-record.schema';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { DefaultRole, Role } from 'src/modules/roles/schemas/role.schema';

interface ApiBody<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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

interface EmailJobData {
  to: string;
  otp?: string;
}

const OWNER = {
  firstName: 'Employee',
  lastName: 'Owner',
  email: 'employees-owner@test.local',
  phone: '+12025550111',
  password: 'Password123',
  pin: '1234',
};

describe('Staff + Clock (integration)', () => {
  let app: INestApplication;
  let dbConnection: Connection;
  let redisService: RedisService;
  let roleModel: ReturnModelType<typeof Role>;

  let clientToken = '';
  let ownerAccessToken = '';
  let ownerBusinessId = '';
  let employeeRoleId = '';

  let nowSpy: jest.Mock;

  let mongoContainer: StartedMongoDBContainer;
  let redisContainer: StartedTestContainer;

  beforeAll(async () => {
    [mongoContainer, redisContainer] = await Promise.all([
      new MongoDBContainer('mongo:7').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    const databaseUrl =
      mongoContainer.getConnectionString() +
      '/servixos_employees_test?directConnection=true';
    const redisUrl = `redis://localhost:${redisContainer.getMappedPort(6379)}`;

    ({ app } = await createTestApp({ databaseUrl, redisUrl }));

    dbConnection = app.get<Connection>(getConnectionToken());
    redisService = app.get(RedisService);
    roleModel = getModelForClass(Role, { existingConnection: dbConnection });

    const tokenRes = await request(app.getHttpServer() as Server).get(
      '/api/auth/client-token',
    );
    clientToken = (tokenRes.body as { data: { token: string } }).data.token;

    const mockAgenda = app.get<Record<string, jest.Mock>>(AgendaService);
    nowSpy = mockAgenda['now'];

    const categoryModel = getModelForClass(BusinessCategory, {
      existingConnection: dbConnection,
    });
    const category = await categoryModel.create({
      name: 'Employees Test Category',
      slug: 'employees-test-category',
      isActive: true,
    });

    const login = await fullOnboarding(OWNER, category._id.toString());
    ownerAccessToken = login.accessToken;
    ownerBusinessId = login.user.businessId;

    const employeeRole = await roleModel
      .findOne({
        businessId: ownerBusinessId,
        name: DefaultRole.EMPLOYEE,
      })
      .lean<Role>();

    if (!employeeRole?._id) {
      throw new Error('Seeded employee role was not created');
    }

    employeeRoleId = employeeRole._id.toString();
  }, 300_000);

  afterAll(async () => {
    if (app) await app.close();
    if (mongoContainer) await mongoContainer.stop();
    if (redisContainer) await redisContainer.stop();
  });

  function req() {
    return request(app.getHttpServer() as Server);
  }

  function authed(r: request.Test): request.Test {
    return signRequest(r, clientToken);
  }

  function asOwner(r: request.Test): request.Test {
    return authed(
      r
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('x-business-id', ownerBusinessId),
    );
  }

  function captureOtpFor(email: string): string {
    const calls = nowSpy.mock.calls as [string, EmailJobData][];
    const match = [...calls]
      .reverse()
      .find((c) => c[0] === JOBS.EMAIL_VERIFICATION && c[1].to === email);
    if (!match?.[1].otp) throw new Error(`No OTP captured for ${email}`);
    return match[1].otp;
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
        country: 'US',
        password: user.password,
        confirmPassword: user.password,
      }),
    );

    const otp = captureOtpFor(user.email);

    const verifyRes = await authed(
      req()
        .post('/api/auth/onboarding/verify-email')
        .send({ email: user.email, otp }),
    );

    const onboardingToken = (
      verifyRes.body as { data: { accessToken: string } }
    ).data.accessToken;

    await authed(
      req()
        .post('/api/auth/onboarding/set-pin')
        .set('Authorization', `Bearer ${onboardingToken}`)
        .send({ pin: user.pin, confirmPin: user.pin }),
    );

    const res = await authed(
      req()
        .post('/api/auth/onboarding/business')
        .set('Authorization', `Bearer ${onboardingToken}`)
        .send({
          businessName: `${user.firstName} Workforce Co`,
          businessCategory: categoryId,
          businessDescription: 'Workforce and time tracking test tenant.',
          timezone: 'America/New_York',
        }),
    );

    return (res.body as ApiBody<LoginPayload>).data!;
  }

  it('supports employee CRUD and detail aggregation endpoints', async () => {
    const createRes = await asOwner(
      req()
        .post('/api/staff')
        .send({
          fullName: 'Sarah Connor',
          email: `employee-${Date.now()}@test.local`,
          phone: '+12025550102',
          roleId: employeeRoleId,
          weeklyHoursTarget: 40,
          dateJoined: '2026-04-01',
        }),
    );

    expect(createRes.status).toBe(201);
    expect((createRes.body as ApiBody).message).toBe(
      STAFF_MESSAGES.SUCCESS.CREATED,
    );

    const employeeId =
      (createRes.body as ApiBody<{ _id: string }>).data?._id ?? '';
    expect(employeeId).toBeTruthy();

    const listRes = await asOwner(
      req().get('/api/staff').query({ page: 1, limit: 10 }),
    );

    expect(listRes.status).toBe(200);
    expect((listRes.body as ApiBody).message).toBe(
      STAFF_MESSAGES.SUCCESS.RETRIEVED,
    );
    expect((listRes.body as ApiBody).meta).toMatchObject({
      page: 1,
      limit: 10,
    });

    const getRes = await asOwner(req().get(`/api/staff/${employeeId}`));

    expect(getRes.status).toBe(200);
    expect((getRes.body as ApiBody).message).toBe(STAFF_MESSAGES.SUCCESS.FOUND);

    const detail = (
      getRes.body as ApiBody<{
        weeklyHours: number;
        recentClockEntries: unknown[];
      }>
    ).data;
    expect(typeof detail?.weeklyHours).toBe('number');
    expect(Array.isArray(detail?.recentClockEntries)).toBe(true);

    const patchRes = await asOwner(
      req().patch(`/api/staff/${employeeId}`).send({
        fullName: 'Sarah Connor Updated',
        weeklyHoursTarget: 45,
      }),
    );

    expect(patchRes.status).toBe(200);
    expect((patchRes.body as ApiBody).message).toBe(
      STAFF_MESSAGES.SUCCESS.UPDATED,
    );

    const deleteRes = await asOwner(req().delete(`/api/staff/${employeeId}`));

    expect(deleteRes.status).toBe(200);
    expect((deleteRes.body as ApiBody).message).toBe(
      STAFF_MESSAGES.SUCCESS.DELETED,
    );
  });

  it('supports end-to-end clock lifecycle and status endpoint', async () => {
    const createRes = await asOwner(
      req()
        .post('/api/staff')
        .send({
          fullName: 'James Okafor',
          email: `clock-employee-${Date.now()}@test.local`,
          phone: '+12025550155',
          roleId: employeeRoleId,
          weeklyHoursTarget: 40,
          dateJoined: '2026-04-01',
        }),
    );

    expect(createRes.status).toBe(201);
    const employeeId =
      (createRes.body as ApiBody<{ _id: string }>).data?._id ?? '';

    const inRes = await asOwner(
      req().post('/api/clock/in').send({ employeeId }),
    );

    expect(inRes.status).toBe(201);
    expect((inRes.body as ApiBody).message).toBe(
      TIME_TRACKING_MESSAGES.SUCCESS.CLOCKED_IN,
    );

    const statusInRes = await asOwner(
      req().get(`/api/clock/status/${employeeId}`),
    );

    expect(statusInRes.status).toBe(200);
    expect((statusInRes.body as ApiBody<{ status: string }>).data?.status).toBe(
      ClockStatus.CLOCKED_IN,
    );

    const breakStartRes = await asOwner(
      req().post('/api/clock/break/start').send({ employeeId }),
    );
    expect(breakStartRes.status).toBe(201);

    const breakEndRes = await asOwner(
      req().post('/api/clock/break/end').send({ employeeId }),
    );
    expect(breakEndRes.status).toBe(201);
    expect((breakEndRes.body as ApiBody).message).toBe(
      TIME_TRACKING_MESSAGES.SUCCESS.BREAK_ENDED,
    );
    expect(
      (breakEndRes.body as ApiBody<{ breakMinutes: number }>).data
        ?.breakMinutes ?? 0,
    ).toBeGreaterThanOrEqual(1);

    const outRes = await asOwner(
      req().post('/api/clock/out').send({ employeeId }),
    );

    expect(outRes.status).toBe(201);
    expect((outRes.body as ApiBody).message).toBe(
      TIME_TRACKING_MESSAGES.SUCCESS.CLOCKED_OUT,
    );

    const statusOutRes = await asOwner(
      req().get(`/api/clock/status/${employeeId}`),
    );

    expect(statusOutRes.status).toBe(200);
    expect(
      (statusOutRes.body as ApiBody<{ status: string }>).data?.status,
    ).toBe(ClockStatus.CLOCKED_OUT);
  });

  it('returns current online employees from redis-backed presence hash', async () => {
    const onlineUser = {
      userId: '64f1a2b3c4d5e6f7a8b9c0d1',
      employeeId: '64f1a2b3c4d5e6f7a8b9c0d2',
      fullName: 'Priya Patel',
      initials: 'PP',
      avatarColor: '#6366f1',
    };

    await redisService.hset(
      `presence:${ownerBusinessId}`,
      onlineUser.userId,
      JSON.stringify(onlineUser),
    );

    const res = await asOwner(req().get('/api/staff/online'));

    expect(res.status).toBe(200);
    expect((res.body as ApiBody).message).toBe(
      STAFF_MESSAGES.SUCCESS.ONLINE_LIST,
    );
    expect(
      (res.body as ApiBody<{ count: number }>).data?.count,
    ).toBeGreaterThan(0);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
