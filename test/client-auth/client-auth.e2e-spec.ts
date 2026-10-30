import { INestApplication, Logger } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { getModelForClass } from '@typegoose/typegoose';
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
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';
import { JOBS } from 'src/common/constants/agenda.constants';
import { CLIENT_AUTH_MESSAGES } from 'src/common/constants/messages/client-auth.messages';

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
  };
}

interface ClientLoginPayload {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    clientId: string;
    name: string;
    email: string;
    businessId: string;
    timezone: string;
    mustChangePassword: boolean;
  };
}

interface EmailJobData {
  to: string;
  otp?: string;
  temporaryPassword?: string;
}

const OWNER = {
  firstName: 'Client',
  lastName: 'Owner',
  email: 'client-auth-owner@test.local',
  phone: '+12025550119',
  password: 'Password123',
  pin: '1122',
};

describe('ClientAuth (integration)', () => {
  let app: INestApplication;
  let warnSpy: jest.SpyInstance;
  let clientToken: string;
  let nowSpy: jest.Mock;
  let categoryId: string;
  let ownerAccessToken = '';
  let ownerBusinessId = '';

  let mongoContainer: StartedMongoDBContainer;
  let redisContainer: StartedTestContainer;

  beforeAll(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      // Suppress expected negative-path auth warnings in test output.
    });
  });

  beforeAll(async () => {
    [mongoContainer, redisContainer] = await Promise.all([
      new MongoDBContainer('mongo:7').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    const databaseUrl =
      mongoContainer.getConnectionString() +
      '/servixos_client_auth_test?directConnection=true';
    const redisUrl = `redis://localhost:${redisContainer.getMappedPort(6379)}`;

    ({ app } = await createTestApp({ databaseUrl, redisUrl }));

    const tokenRes = await request(app.getHttpServer() as Server).get(
      '/api/auth/client-token',
    );
    clientToken = (tokenRes.body as { data: { token: string } }).data.token;

    const mockAgenda = app.get<Record<string, jest.Mock>>(AgendaService);
    nowSpy = mockAgenda['now'];

    const dbConnection = app.get<Connection>(getConnectionToken());
    const categoryModel = getModelForClass(BusinessCategory, {
      existingConnection: dbConnection,
    });
    const category = await categoryModel.create({
      name: 'Cleaning',
      slug: 'cleaning-client-auth',
      isActive: true,
    });
    categoryId = category._id.toString();

    const ownerLogin = await fullOnboarding(OWNER, categoryId);
    ownerAccessToken = ownerLogin.accessToken;
    ownerBusinessId = ownerLogin.user.businessId;
  }, 300_000);

  afterAll(async () => {
    if (app) await app.close();
    if (mongoContainer) await mongoContainer.stop();
    if (redisContainer) await redisContainer.stop();
    warnSpy.mockRestore();
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

    if (!match?.[1].otp) {
      throw new Error(`No verification OTP captured for ${email}`);
    }

    return match[1].otp;
  }

  function captureClientTemporaryPassword(email: string): string {
    const calls = nowSpy.mock.calls as [string, EmailJobData][];
    const match = [...calls]
      .reverse()
      .find((c) => c[0] === JOBS.EMAIL_CLIENT_CREDENTIALS && c[1].to === email);

    if (!match?.[1].temporaryPassword) {
      throw new Error(`No temporary client password captured for ${email}`);
    }

    return match[1].temporaryPassword;
  }

  function captureResetOtpFor(email: string): string {
    const calls = nowSpy.mock.calls as [string, EmailJobData][];
    const match = [...calls]
      .reverse()
      .find((c) => c[0] === JOBS.EMAIL_PASSWORD_RESET && c[1].to === email);

    if (!match?.[1].otp) {
      throw new Error(`No password reset OTP captured for ${email}`);
    }

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
    businessCategory: string,
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

    const businessRes = await authed(
      req()
        .post('/api/auth/onboarding/business')
        .set('Authorization', `Bearer ${onboardingToken}`)
        .send({
          businessName: `${user.firstName} Business`,
          businessCategory,
          businessDescription:
            'Business profile used for client authentication integration tests.',
          timezone: 'America/New_York',
        }),
    );

    return (businessRes.body as ApiBody<LoginPayload>).data!;
  }

  it('supports login, profile, refresh, logout, and password reset for client accounts', async () => {
    const clientEmail = `client-auth-${Date.now()}@test.local`;

    const createClientRes = await asOwner(
      req().post('/api/clients').send({
        name: 'Client Auth User',
        email: clientEmail,
        phone: '+12025550188',
      }),
    );
    expect(createClientRes.status).toBe(201);

    const temporaryPassword = captureClientTemporaryPassword(clientEmail);

    const loginRes = await authed(
      req().post('/api/client-auth/login').send({
        email: clientEmail,
        password: temporaryPassword,
      }),
    );
    expect(loginRes.status).toBe(200);
    expect((loginRes.body as ApiBody).message).toBe(
      CLIENT_AUTH_MESSAGES.SUCCESS.LOGIN,
    );

    const loginBody = loginRes.body as ApiBody<ClientLoginPayload>;
    const accessToken = loginBody.data!.accessToken;
    const refreshToken = loginBody.data!.refreshToken;
    const clientUser = loginBody.data!.user;

    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    expect(clientUser.email).toBe(clientEmail);
    expect(clientUser.mustChangePassword).toBe(true);

    const meRes = await authed(
      req()
        .get('/api/client-auth/me')
        .set('Authorization', `Bearer ${accessToken}`),
    );
    expect(meRes.status).toBe(200);
    const meBody = meRes.body as ApiBody<ClientLoginPayload['user']>;
    expect(meBody.data?.id).toBe(clientUser.id);
    expect(meBody.data?.clientId).toBe(clientUser.clientId);

    const refreshRes = await authed(
      req().post('/api/client-auth/refresh').send({ refreshToken }),
    );
    expect(refreshRes.status).toBe(200);
    expect(
      (refreshRes.body as ApiBody<{ accessToken: string }>).data?.accessToken,
    ).toBeTruthy();

    const logoutRes = await authed(
      req().post('/api/client-auth/logout').send({ refreshToken }),
    );
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogoutRes = await authed(
      req().post('/api/client-auth/refresh').send({ refreshToken }),
    );
    expect(refreshAfterLogoutRes.status).toBe(401);

    const forgotRes = await authed(
      req()
        .post('/api/client-auth/forgot-password')
        .send({ email: clientEmail }),
    );
    expect(forgotRes.status).toBe(200);

    const resetOtp = captureResetOtpFor(clientEmail);
    const newPassword = 'NewPassword123';

    const resetRes = await authed(
      req().post('/api/client-auth/reset-password').send({
        otp: resetOtp,
        newPassword,
      }),
    );
    expect(resetRes.status).toBe(200);

    const oldPasswordLoginRes = await authed(
      req().post('/api/client-auth/login').send({
        email: clientEmail,
        password: temporaryPassword,
      }),
    );
    expect(oldPasswordLoginRes.status).toBe(401);

    const newPasswordLoginRes = await authed(
      req().post('/api/client-auth/login').send({
        email: clientEmail,
        password: newPassword,
      }),
    );
    expect(newPasswordLoginRes.status).toBe(200);
    const reloginBody = newPasswordLoginRes.body as ApiBody<ClientLoginPayload>;
    expect(reloginBody.data?.user.mustChangePassword).toBe(false);
  });
});
