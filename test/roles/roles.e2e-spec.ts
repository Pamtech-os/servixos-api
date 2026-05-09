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
import { signRequest } from '../helpers/sign-request';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { JOBS } from 'src/common/constants/agenda.constants';
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { ROLES_MESSAGES } from 'src/common/constants/messages/roles.messages';
import { DefaultRole, Role } from 'src/modules/roles/schemas/role.schema';
import { User, UserRole } from 'src/modules/users/schemas/user.schema';

interface ApiBody<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
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
  firstName: 'Role',
  lastName: 'Owner',
  email: 'roles-owner@test.local',
  phone: '+12025550111',
  password: 'Password123',
  pin: '1234',
};

describe('Roles (integration)', () => {
  let app: INestApplication;
  let dbConnection: Connection;
  let redisService: RedisService;
  let clientToken = '';
  let ownerAccessToken = '';
  let ownerBusinessId = '';
  let roleModel: ReturnModelType<typeof Role>;
  let userModel: ReturnModelType<typeof User>;
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
      '/servixos_roles_test?directConnection=true';
    const redisUrl = `redis://localhost:${redisContainer.getMappedPort(6379)}`;

    ({ app } = await createTestApp({ databaseUrl, redisUrl }));
    redisService = app.get(RedisService);

    const tokenRes = await request(app.getHttpServer() as Server).get(
      '/api/auth/client-token',
    );
    clientToken = (tokenRes.body as { data: { token: string } }).data.token;

    dbConnection = app.get<Connection>(getConnectionToken());
    roleModel = getModelForClass(Role, { existingConnection: dbConnection });
    userModel = getModelForClass(User, { existingConnection: dbConnection });

    const mockAgenda = app.get<Record<string, jest.Mock>>(AgendaService);
    nowSpy = mockAgenda['now'];

    const categoryModel = getModelForClass(BusinessCategory, {
      existingConnection: dbConnection,
    });
    const category = await categoryModel.create({
      name: 'Roles Test Category',
      slug: 'roles-test-category',
      isActive: true,
    });

    const login = await fullOnboarding(OWNER, category._id.toString());
    ownerAccessToken = login.accessToken;
    ownerBusinessId = login.user.businessId;
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
          businessName: `${user.firstName} Roles Co`,
          businessCategory: categoryId,
          businessDescription: 'Business role management and operations.',
          timezone: 'America/New_York',
        }),
    );

    return (res.body as ApiBody<LoginPayload>).data!;
  }

  it('GET /api/roles returns seeded default roles and populates cache', async () => {
    const res = await asOwner(req().get('/api/roles'));

    expect(res.status).toBe(200);
    expect((res.body as ApiBody).message).toBe(
      ROLES_MESSAGES.SUCCESS.RETRIEVED,
    );

    const body = res.body as ApiBody<Array<{ name: string }>>;
    const names = body.data?.map((role) => role.name) ?? [];
    expect(names).toContain(DefaultRole.OWNER);
    expect(names).toContain(DefaultRole.MANAGER);
    expect(names).toContain(DefaultRole.EMPLOYEE);

    const cached = await redisService.get(`${ownerBusinessId}:roles:list`);
    expect(cached).not.toBeNull();
  });

  it('POST /api/roles creates a custom role with valid permissions', async () => {
    const res = await asOwner(
      req()
        .post('/api/roles')
        .send({
          name: 'Dispatcher',
          permissions: [
            'dashboard.view',
            'jobs.view',
            'jobs.edit',
            'clients.view',
          ],
        }),
    );

    expect(res.status).toBe(201);
    expect((res.body as ApiBody).message).toBe(ROLES_MESSAGES.SUCCESS.CREATED);

    const role = (res.body as ApiBody<{ _id: string; name: string }>).data;
    expect(role?.name).toBe('Dispatcher');
  });

  it('POST /api/roles returns 400 when permission strings are invalid', async () => {
    const res = await asOwner(
      req()
        .post('/api/roles')
        .send({
          name: 'Invalid Permission Role',
          permissions: ['dashboard.view', 'jobs.view', 'not.real.permission'],
        }),
    );

    expect(res.status).toBe(400);
  });

  it('PATCH /api/roles/:id updates a custom role', async () => {
    const createRes = await asOwner(
      req()
        .post('/api/roles')
        .send({
          name: 'Technician',
          permissions: ['jobs.view', 'jobs.edit'],
        }),
    );
    const roleId = (createRes.body as ApiBody<{ _id: string }>).data?._id;

    const patchRes = await asOwner(
      req()
        .patch(`/api/roles/${roleId}`)
        .send({
          name: 'Senior Technician',
          permissions: ['jobs.view', 'jobs.edit', 'clients.view'],
        }),
    );

    expect(patchRes.status).toBe(200);
    expect((patchRes.body as ApiBody).message).toBe(
      ROLES_MESSAGES.SUCCESS.UPDATED,
    );
    expect((patchRes.body as ApiBody<{ name: string }>).data?.name).toBe(
      'Senior Technician',
    );
  });

  it("PATCH /api/roles/:id returns 403 when changing owner's role permissions", async () => {
    const ownerRole = await roleModel
      .findOne({
        businessId: ownerBusinessId,
        name: DefaultRole.OWNER,
      })
      .lean<Role>();

    expect(ownerRole?._id).toBeDefined();

    const res = await asOwner(
      req()
        .patch(`/api/roles/${ownerRole!._id.toString()}`)
        .send({
          permissions: ['dashboard.view'],
        }),
    );

    expect(res.status).toBe(403);
    expect((res.body as ApiBody).message).toBe(
      ROLES_MESSAGES.ERROR.OWNER_ROLE_PERMISSIONS,
    );
  });

  it('PATCH /api/roles/:id allows changing manager role permissions', async () => {
    const managerRole = await roleModel
      .findOne({
        businessId: ownerBusinessId,
        name: DefaultRole.MANAGER,
      })
      .lean<Role>();

    expect(managerRole?._id).toBeDefined();

    const res = await asOwner(
      req()
        .patch(`/api/roles/${managerRole!._id.toString()}`)
        .send({
          permissions: ['dashboard.view', 'jobs.view', 'jobs.edit'],
        }),
    );

    expect(res.status).toBe(200);
    expect((res.body as ApiBody).message).toBe(ROLES_MESSAGES.SUCCESS.UPDATED);
    expect(
      (res.body as ApiBody<{ permissions: string[] }>).data?.permissions,
    ).toEqual(['dashboard.view', 'jobs.view', 'jobs.edit']);
  });

  it('DELETE /api/roles/:id deletes custom role and blocks default role deletion', async () => {
    const createRes = await asOwner(
      req()
        .post('/api/roles')
        .send({
          name: 'Temp Delete Role',
          permissions: ['jobs.view'],
        }),
    );
    const customRoleId = (createRes.body as ApiBody<{ _id: string }>).data?._id;

    const deleteCustomRes = await asOwner(
      req().delete(`/api/roles/${customRoleId}`),
    );

    expect(deleteCustomRes.status).toBe(200);
    expect((deleteCustomRes.body as ApiBody).message).toBe(
      ROLES_MESSAGES.SUCCESS.DELETED,
    );

    const managerRole = await roleModel
      .findOne({
        businessId: ownerBusinessId,
        name: DefaultRole.MANAGER,
      })
      .lean<Role>();

    const deleteDefaultRes = await asOwner(
      req().delete(`/api/roles/${managerRole!._id.toString()}`),
    );

    expect(deleteDefaultRes.status).toBe(403);
    expect((deleteDefaultRes.body as ApiBody).message).toBe(
      ROLES_MESSAGES.ERROR.DEFAULT_ROLE,
    );
  });

  it('DELETE /api/roles/:id returns 409 when users are attached to the role', async () => {
    const createRes = await asOwner(
      req()
        .post('/api/roles')
        .send({
          name: 'Assigned Role',
          permissions: ['jobs.view'],
        }),
    );
    const roleId = (createRes.body as ApiBody<{ _id: string }>).data?._id;
    expect(roleId).toBeDefined();

    await userModel.create({
      firstName: 'Attached',
      lastName: 'User',
      email: `attached-role-${Date.now()}@test.local`,
      passwordHash: 'hashed-password-placeholder',
      userRole: UserRole.EMPLOYEE,
      businessId: new Types.ObjectId(ownerBusinessId),
      roleId: new Types.ObjectId(roleId),
      isActive: true,
      isEmailVerified: true,
    });

    const deleteRes = await asOwner(req().delete(`/api/roles/${roleId}`));

    expect(deleteRes.status).toBe(409);
    expect((deleteRes.body as ApiBody).message).toBe(
      ROLES_MESSAGES.ERROR.ROLE_IN_USE,
    );
  });

  it('GET /api/permissions returns full permission list and caches it', async () => {
    const res = await asOwner(req().get('/api/permissions'));

    expect(res.status).toBe(200);
    expect((res.body as ApiBody).message).toBe(
      ROLES_MESSAGES.SUCCESS.PERMISSIONS_RETRIEVED,
    );

    const permissions = (res.body as ApiBody<string[]>).data ?? [];
    expect(permissions.length).toBeGreaterThanOrEqual(30);
    expect(permissions).toContain('dashboard.view');
    expect(permissions).toContain('jobs.edit');

    const cached = await redisService.get('permissions:all');
    expect(cached).not.toBeNull();
  });
});
