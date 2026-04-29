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
import { AgendaService } from 'src/modules/agenda/agenda.service';
import { RedisService } from 'src/modules/redis/redis.service';
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';
import { User } from 'src/modules/users/schemas/user.schema';
import { Role, DefaultRole } from 'src/modules/roles/schemas/role.schema';
import { WebsiteConfig } from 'src/modules/website/schemas/website-config.schema';
import { RefreshToken } from 'src/modules/auth/schemas/refresh-token.schema';
import { JOBS } from 'src/modules/agenda/agenda.constants';
import { hashToken } from 'src/common/utils/hash.util';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

// ─── Response shape ───────────────────────────────────────────────────────────

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

interface TokenPayload {
  accessToken: string;
}

interface EmailJobData {
  to: string;
  firstName?: string;
  otp?: string;
}

// ─── Test constants ───────────────────────────────────────────────────────────

const PHONE = '+12025550199';
const BUSINESS_DESC =
  'Professional cleaning services for residential and commercial clients.';

const SEEDED_USER = {
  firstName: 'Seeded',
  lastName: 'User',
  email: 'seeded@test.local',
  phone: PHONE,
  password: 'Password123',
  pin: '9999',
};

const RESET_USER = {
  firstName: 'Reset',
  lastName: 'User',
  email: 'reset@test.local',
  phone: PHONE,
  password: 'OldPass123',
  pin: '1111',
};

let _emailSeq = 0;
const nextEmail = (): string => `u${++_emailSeq}@test.local`;

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Auth (integration)', () => {
  let app: INestApplication;
  let apiKey: string;
  let dbConnection: Connection;
  let nowSpy: jest.Mock;
  let categoryId: string;

  let userModel: ReturnModelType<typeof User>;
  let roleModel: ReturnModelType<typeof Role>;
  let websiteConfigModel: ReturnModelType<typeof WebsiteConfig>;
  let refreshTokenModel: ReturnModelType<typeof RefreshToken>;

  let mongoContainer: StartedMongoDBContainer;
  let redisContainer: StartedTestContainer;

  // ─── Shared setup ───────────────────────────────────────────────────────────

  beforeAll(async () => {
    [mongoContainer, redisContainer] = await Promise.all([
      new MongoDBContainer('mongo:7').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    const databaseUrl =
      mongoContainer.getConnectionString() +
      '/servixos_test?directConnection=true';
    const redisUrl = `redis://localhost:${redisContainer.getMappedPort(6379)}`;

    ({ app, apiKey } = await createTestApp({ databaseUrl, redisUrl }));

    dbConnection = app.get<Connection>(getConnectionToken());
    userModel = getModelForClass(User, { existingConnection: dbConnection });
    roleModel = getModelForClass(Role, { existingConnection: dbConnection });
    websiteConfigModel = getModelForClass(WebsiteConfig, {
      existingConnection: dbConnection,
    });
    refreshTokenModel = getModelForClass(RefreshToken, {
      existingConnection: dbConnection,
    });

    const mockAgenda = app.get<Record<string, jest.Mock>>(AgendaService);
    nowSpy = mockAgenda['now'];

    const catModel = getModelForClass(BusinessCategory, {
      existingConnection: dbConnection,
    });
    const cat = await catModel.create({
      name: 'Cleaning',
      slug: 'cleaning',
      isActive: true,
    });
    categoryId = String(cat._id);

    await fullOnboarding(SEEDED_USER);
    await fullOnboarding(RESET_USER);
  }, 300_000);

  afterAll(async () => {
    await app.close();
    await mongoContainer.stop();
    await redisContainer.stop();
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function req(): request.SuperTest<request.Test> {
    return request(app.getHttpServer() as Server);
  }

  function authed(r: request.Test): request.Test {
    return r.set('x-api-key', apiKey);
  }

  function makeAccountPayload(email: string) {
    return {
      firstName: 'Test',
      lastName: 'User',
      email,
      phone: PHONE,
      password: 'Password123',
      confirmPassword: 'Password123',
    };
  }

  function captureOtpFor(email: string): string {
    const calls = nowSpy.mock.calls as [string, EmailJobData][];
    const match = [...calls]
      .reverse()
      .find((c) => c[0] === JOBS.EMAIL_VERIFICATION && c[1].to === email);
    if (!match?.[1].otp) throw new Error(`No OTP captured for ${email}`);
    return match[1].otp;
  }

  function capturePasswordResetOtpFor(email: string): string {
    const calls = nowSpy.mock.calls as [string, EmailJobData][];
    const match = [...calls]
      .reverse()
      .find((c) => c[0] === JOBS.EMAIL_PASSWORD_RESET && c[1].to === email);
    if (!match?.[1].otp) throw new Error(`No reset OTP captured for ${email}`);
    return match[1].otp;
  }

  async function createAccountOnly(email: string): Promise<void> {
    await authed(
      req()
        .post('/api/auth/onboarding/account')
        .send(makeAccountPayload(email)),
    );
  }

  async function accountAndVerify(email: string): Promise<void> {
    await createAccountOnly(email);
    const otp = captureOtpFor(email);
    await authed(
      req().post('/api/auth/onboarding/verify-email').send({ email, otp }),
    );
  }

  async function readyForBusiness(email: string): Promise<void> {
    await accountAndVerify(email);
    await authed(
      req()
        .post('/api/auth/onboarding/set-pin')
        .send({ email, pin: '1234', confirmPin: '1234' }),
    );
  }

  async function fullOnboarding(user: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
    pin: string;
  }): Promise<LoginPayload> {
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
          businessName: `${user.firstName} Business`,
          businessCategory: categoryId,
          businessDescription: BUSINESS_DESC,
          timezone: 'America/New_York',
        }),
    );
    return (res.body as ApiBody<LoginPayload>).data!;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/auth/onboarding/account
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/onboarding/account', () => {
    describe('input validation — 400', () => {
      it('returns 400 when request body is empty', async () => {
        // Arrange & Act
        const res = await authed(
          req().post('/api/auth/onboarding/account').send({}),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it.each<[string, Record<string, unknown>]>([
        ['firstName', { firstName: undefined }],
        ['lastName', { lastName: undefined }],
        ['email', { email: undefined }],
        ['phone', { phone: undefined }],
        ['password', { password: undefined }],
        ['confirmPassword', { confirmPassword: undefined }],
      ])('returns 400 when %s is missing', async (_field, override) => {
        // Arrange
        const payload = {
          ...makeAccountPayload(nextEmail()),
          ...override,
        };
        // Act
        const res = await authed(
          req().post('/api/auth/onboarding/account').send(payload),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when email format is invalid', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/account')
            .send({
              ...makeAccountPayload(nextEmail()),
              email: 'not-an-email',
            }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when phone is not a valid E.164 number', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/account')
            .send({ ...makeAccountPayload(nextEmail()), phone: '12345' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when password is shorter than 8 characters', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/account')
            .send({
              ...makeAccountPayload(nextEmail()),
              password: 'Abc1',
              confirmPassword: 'Abc1',
            }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when password has no uppercase letter', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/account')
            .send({
              ...makeAccountPayload(nextEmail()),
              password: 'password123',
              confirmPassword: 'password123',
            }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when password has no digit', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/account')
            .send({
              ...makeAccountPayload(nextEmail()),
              password: 'PasswordAbc',
              confirmPassword: 'PasswordAbc',
            }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when passwords do not match', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/account')
            .send({
              ...makeAccountPayload(nextEmail()),
              confirmPassword: 'Different1',
            }),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('API key guard', () => {
      it('returns 401 when x-api-key header is missing', async () => {
        // Arrange & Act
        const res = await req()
          .post('/api/auth/onboarding/account')
          .send(makeAccountPayload(nextEmail()));
        // Assert
        expect(res.status).toBe(401);
      });

      it('returns 401 when x-api-key is invalid', async () => {
        // Arrange & Act
        const res = await req()
          .post('/api/auth/onboarding/account')
          .set('x-api-key', 'wrong-key')
          .send(makeAccountPayload(nextEmail()));
        // Assert
        expect(res.status).toBe(401);
      });
    });

    describe('happy path', () => {
      it('returns 201 and creates a user record in the database', async () => {
        // Arrange
        const email = nextEmail();
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/account')
            .send(makeAccountPayload(email)),
        );
        const user = await userModel.findOne({ email }).lean<User>();
        // Assert
        expect(res.status).toBe(201);
        expect((res.body as ApiBody).success).toBe(true);
        expect(user).not.toBeNull();
      });

      it('creates the user with isActive false and isEmailVerified false', async () => {
        // Arrange
        const email = nextEmail();
        // Act
        await authed(
          req()
            .post('/api/auth/onboarding/account')
            .send(makeAccountPayload(email)),
        );
        const user = await userModel.findOne({ email }).lean<User>();
        // Assert
        expect(user?.isActive).toBe(false);
        expect(user?.isEmailVerified).toBe(false);
      });

      it('stores the OTP as a SHA-256 hash with a future expiry', async () => {
        // Arrange
        const email = nextEmail();
        // Act
        await authed(
          req()
            .post('/api/auth/onboarding/account')
            .send(makeAccountPayload(email)),
        );
        const rawOtp = captureOtpFor(email);
        const user = await userModel.findOne({ email }).lean<User>();
        // Assert
        expect(user?.emailVerificationOtp).toBe(hashToken(rawOtp));
        expect(user?.emailVerificationOtp).not.toBe(rawOtp);
        expect(user?.emailVerificationOtpExpiry!.getTime()).toBeGreaterThan(
          Date.now(),
        );
      });

      it('schedules an email:verification job with the raw OTP', async () => {
        // Arrange
        const email = nextEmail();
        nowSpy.mockClear();
        // Act
        await authed(
          req()
            .post('/api/auth/onboarding/account')
            .send(makeAccountPayload(email)),
        );
        // Assert
        const calls = nowSpy.mock.calls as [string, EmailJobData][];
        const emailCall = calls.find(
          (c) => c[0] === JOBS.EMAIL_VERIFICATION && c[1].to === email,
        );
        expect(emailCall).toBeDefined();
        expect(emailCall![1].otp).toHaveLength(6);
      });
    });

    describe('conflict — 409', () => {
      it('returns 409 when the email is already registered', async () => {
        // Arrange
        const email = nextEmail();
        const payload = makeAccountPayload(email);
        await authed(req().post('/api/auth/onboarding/account').send(payload));
        // Act
        const res = await authed(
          req().post('/api/auth/onboarding/account').send(payload),
        );
        // Assert
        expect(res.status).toBe(409);
      });

      it('handles concurrent duplicate registration — only one succeeds', async () => {
        // Arrange
        const email = nextEmail();
        const payload = makeAccountPayload(email);
        // Act
        const [res1, res2] = await Promise.all([
          authed(req().post('/api/auth/onboarding/account').send(payload)),
          authed(req().post('/api/auth/onboarding/account').send(payload)),
        ]);
        // Assert
        const statuses = [res1.status, res2.status].sort();
        expect(statuses).toEqual([201, 409]);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/auth/onboarding/verify-email
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/onboarding/verify-email', () => {
    describe('input validation — 400', () => {
      it('returns 400 when email is missing', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/verify-email')
            .send({ otp: '123456' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when otp is missing', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/verify-email')
            .send({ email: nextEmail() }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when OTP is not exactly 6 characters', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/verify-email')
            .send({ email: nextEmail(), otp: '12345' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('happy path', () => {
      it('returns 200, marks email as verified, and clears OTP fields from DB', async () => {
        // Arrange
        const email = nextEmail();
        await createAccountOnly(email);
        const rawOtp = captureOtpFor(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/verify-email')
            .send({ email, otp: rawOtp }),
        );
        const user = await userModel.findOne({ email }).lean<User>();
        // Assert
        expect(res.status).toBe(200);
        expect((res.body as ApiBody).success).toBe(true);
        expect(user?.isEmailVerified).toBe(true);
        expect(user?.emailVerificationOtp).toBeUndefined();
        expect(user?.emailVerificationOtpExpiry).toBeUndefined();
      });
    });

    describe('error cases', () => {
      it('returns 400 when the OTP is wrong', async () => {
        // Arrange
        const email = nextEmail();
        await createAccountOnly(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/verify-email')
            .send({ email, otp: '000000' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when the OTP has expired', async () => {
        // Arrange
        const email = nextEmail();
        await createAccountOnly(email);
        const rawOtp = captureOtpFor(email);
        await userModel.updateOne(
          { email },
          {
            $set: {
              emailVerificationOtpExpiry: new Date(Date.now() - 1_000),
            },
          },
        );
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/verify-email')
            .send({ email, otp: rawOtp }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when the email is not registered', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/verify-email')
            .send({ email: 'nobody@test.local', otp: '123456' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when the email is already verified', async () => {
        // Arrange — verify once successfully
        const email = nextEmail();
        await createAccountOnly(email);
        const rawOtp = captureOtpFor(email);
        await authed(
          req()
            .post('/api/auth/onboarding/verify-email')
            .send({ email, otp: rawOtp }),
        );
        // Act — attempt to verify again
        const res = await authed(
          req()
            .post('/api/auth/onboarding/verify-email')
            .send({ email, otp: rawOtp }),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/auth/onboarding/resend-otp
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/onboarding/resend-otp', () => {
    describe('input validation — 400', () => {
      it('returns 400 when email is missing', async () => {
        // Arrange & Act
        const res = await authed(
          req().post('/api/auth/onboarding/resend-otp').send({}),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('enumeration prevention — always 200', () => {
      it('returns 200 even when the email is not registered', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/resend-otp')
            .send({ email: 'ghost@test.local' }),
        );
        // Assert
        expect(res.status).toBe(200);
      });

      it('returns 200 even when the email is already verified', async () => {
        // Arrange & Act — SEEDED_USER is fully verified
        const res = await authed(
          req()
            .post('/api/auth/onboarding/resend-otp')
            .send({ email: SEEDED_USER.email }),
        );
        // Assert
        expect(res.status).toBe(200);
      });

      it('does not schedule an email for a non-existent address', async () => {
        // Arrange
        nowSpy.mockClear();
        // Act
        await authed(
          req()
            .post('/api/auth/onboarding/resend-otp')
            .send({ email: 'ghost@test.local' }),
        );
        // Assert
        const calls = nowSpy.mock.calls as [string, EmailJobData][];
        const ghostCalls = calls.filter((c) => c[1].to === 'ghost@test.local');
        expect(ghostCalls).toHaveLength(0);
      });
    });

    describe('happy path', () => {
      it('issues a new OTP hash that replaces the previous one in the DB', async () => {
        // Arrange
        const email = nextEmail();
        await createAccountOnly(email);
        const userBefore = await userModel.findOne({ email }).lean<User>();
        const firstHash = userBefore?.emailVerificationOtp;
        // Act
        await authed(
          req().post('/api/auth/onboarding/resend-otp').send({ email }),
        );
        const userAfter = await userModel.findOne({ email }).lean<User>();
        // Assert
        expect(userAfter?.emailVerificationOtp).toBeDefined();
        expect(userAfter?.emailVerificationOtp).not.toBe(firstHash);
      });

      it('the old OTP is invalidated after a resend', async () => {
        // Arrange
        const email = nextEmail();
        await createAccountOnly(email);
        const firstOtp = captureOtpFor(email);
        await authed(
          req().post('/api/auth/onboarding/resend-otp').send({ email }),
        );
        // Act — try to verify with the stale OTP
        const res = await authed(
          req()
            .post('/api/auth/onboarding/verify-email')
            .send({ email, otp: firstOtp }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('schedules a new email:verification job for the resend', async () => {
        // Arrange
        const email = nextEmail();
        await createAccountOnly(email);
        nowSpy.mockClear();
        // Act
        await authed(
          req().post('/api/auth/onboarding/resend-otp').send({ email }),
        );
        // Assert
        const calls = nowSpy.mock.calls as [string, EmailJobData][];
        const resendCall = calls.find(
          (c) => c[0] === JOBS.EMAIL_VERIFICATION && c[1].to === email,
        );
        expect(resendCall).toBeDefined();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/auth/onboarding/set-pin
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/onboarding/set-pin', () => {
    describe('input validation — 400', () => {
      it.each<[string, Record<string, unknown>]>([
        ['email', { email: undefined }],
        ['pin', { pin: undefined }],
        ['confirmPin', { confirmPin: undefined }],
      ])('returns 400 when %s is missing', async (_field, override) => {
        // Arrange
        const base = {
          email: SEEDED_USER.email,
          pin: '1234',
          confirmPin: '1234',
        };
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/set-pin')
            .send({ ...base, ...override }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it.each([
        ['123', 'fewer than 4 digits'],
        ['12345', 'more than 4 digits'],
        ['abcd', 'non-numeric characters'],
      ])('returns 400 when pin is %s (%s)', async (pin, _desc) => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/set-pin')
            .send({ email: SEEDED_USER.email, pin, confirmPin: pin }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when pin and confirmPin do not match', async () => {
        // Arrange & Act
        const res = await authed(
          req().post('/api/auth/onboarding/set-pin').send({
            email: SEEDED_USER.email,
            pin: '1234',
            confirmPin: '5678',
          }),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('happy path', () => {
      it('returns 200 and stores the PIN as a bcrypt hash, not plaintext', async () => {
        // Arrange
        const email = nextEmail();
        await accountAndVerify(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/set-pin')
            .send({ email, pin: '4321', confirmPin: '4321' }),
        );
        const user = await userModel.findOne({ email }).lean<User>();
        // Assert
        expect(res.status).toBe(200);
        expect(user?.pinHash).toBeDefined();
        expect(user?.pinHash).not.toBe('4321');
        expect(user?.pinHash!.startsWith('$2')).toBe(true);
      });
    });

    describe('error cases', () => {
      it('returns 400 when the email is not registered', async () => {
        // Arrange & Act
        const res = await authed(
          req().post('/api/auth/onboarding/set-pin').send({
            email: 'nobody@test.local',
            pin: '1234',
            confirmPin: '1234',
          }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when the email has not been verified yet', async () => {
        // Arrange — account exists but email not verified
        const email = nextEmail();
        await createAccountOnly(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/set-pin')
            .send({ email, pin: '1234', confirmPin: '1234' }),
        );
        // Assert
        expect(res.status).toBe(400);
        expect((res.body as ApiBody).message).toBe(
          AUTH_MESSAGES.ERROR.EMAIL_NOT_VERIFIED,
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/auth/onboarding/business
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/onboarding/business', () => {
    const baseBusinessPayload = (email: string) => ({
      email,
      businessName: 'Test Cleaning Co',
      businessCategory: categoryId,
      businessDescription: BUSINESS_DESC,
      timezone: 'America/New_York',
    });

    describe('input validation — 400', () => {
      it.each<[string, Record<string, unknown>]>([
        ['email', { email: undefined }],
        ['businessName', { businessName: undefined }],
        ['businessCategory', { businessCategory: undefined }],
        ['businessDescription', { businessDescription: undefined }],
        ['timezone', { timezone: undefined }],
      ])('returns 400 when %s is missing', async (_field, override) => {
        // Arrange
        const email = nextEmail();
        await readyForBusiness(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send({ ...baseBusinessPayload(email), ...override }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when businessCategory is not a valid MongoId', async () => {
        // Arrange
        const email = nextEmail();
        await readyForBusiness(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send({
              ...baseBusinessPayload(email),
              businessCategory: 'invalid',
            }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when timezone is not a valid IANA string', async () => {
        // Arrange
        const email = nextEmail();
        await readyForBusiness(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send({
              ...baseBusinessPayload(email),
              timezone: 'Not/A/Timezone',
            }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when businessDescription contains a flagged term', async () => {
        // Arrange
        const email = nextEmail();
        await readyForBusiness(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send({
              ...baseBusinessPayload(email),
              businessDescription: 'We offer fraud and scam services.',
            }),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('happy path', () => {
      it('returns 201 with accessToken, refreshToken, and user data including subdomain', async () => {
        // Arrange
        const email = nextEmail();
        await readyForBusiness(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send(baseBusinessPayload(email)),
        );
        const body = res.body as ApiBody<LoginPayload>;
        // Assert
        expect(res.status).toBe(201);
        expect(body.data?.accessToken).toBeDefined();
        expect(body.data?.refreshToken).toBeDefined();
        expect(body.data?.user.businessId).toBeDefined();
        expect(body.data?.user.subdomain).toBeDefined();
      });

      it('auto-creates three default roles (Owner, Manager, Employee)', async () => {
        // Arrange
        const email = nextEmail();
        await readyForBusiness(email);
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send(baseBusinessPayload(email)),
        );
        const businessId = (res.body as ApiBody<LoginPayload>).data?.user
          .businessId;
        // Act
        const roles = await roleModel.find({ businessId }).lean<Role[]>();
        // Assert
        const names = roles.map((r) => r.name);
        expect(names).toContain(DefaultRole.OWNER);
        expect(names).toContain(DefaultRole.MANAGER);
        expect(names).toContain(DefaultRole.EMPLOYEE);
        expect(roles).toHaveLength(3);
      });

      it('auto-creates a WebsiteConfig document for the business', async () => {
        // Arrange
        const email = nextEmail();
        await readyForBusiness(email);
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send(baseBusinessPayload(email)),
        );
        const businessId = (res.body as ApiBody<LoginPayload>).data?.user
          .businessId;
        // Act
        const config = await websiteConfigModel
          .findOne({ businessId })
          .lean<WebsiteConfig>();
        // Assert
        expect(config).not.toBeNull();
      });

      it('sets user.businessId, user.isActive to true, and assigns the Owner role', async () => {
        // Arrange
        const email = nextEmail();
        await readyForBusiness(email);
        // Act
        await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send(baseBusinessPayload(email)),
        );
        const user = await userModel.findOne({ email }).lean<User>();
        // Assert
        expect(user?.businessId).toBeDefined();
        expect(user?.isActive).toBe(true);
        expect(user?.roleId).toBeDefined();
      });

      it('generates a URL-safe subdomain from the business name', async () => {
        // Arrange
        const email = nextEmail();
        await readyForBusiness(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send({
              ...baseBusinessPayload(email),
              businessName: 'My Test Biz!',
            }),
        );
        // Assert
        const subdomain = (res.body as ApiBody<LoginPayload>).data?.user
          .subdomain;
        expect(subdomain).toMatch(/^[a-z0-9-]+$/);
      });

      it('appends a numeric suffix to the subdomain when the base is already taken', async () => {
        // Arrange — two users with the same business name
        const [email1, email2] = [nextEmail(), nextEmail()];
        await readyForBusiness(email1);
        await readyForBusiness(email2);
        const sharedName = 'Duplicate Name Biz';
        const res1 = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send({ ...baseBusinessPayload(email1), businessName: sharedName }),
        );
        const res2 = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send({ ...baseBusinessPayload(email2), businessName: sharedName }),
        );
        // Assert — subdomains must differ
        const sub1 = (res1.body as ApiBody<LoginPayload>).data?.user.subdomain;
        const sub2 = (res2.body as ApiBody<LoginPayload>).data?.user.subdomain;
        expect(sub1).toBeDefined();
        expect(sub2).toBeDefined();
        expect(sub1).not.toBe(sub2);
        expect(sub2).toMatch(/-\d+$/);
      });

      it('schedules an email:welcome job after business setup', async () => {
        // Arrange
        const email = nextEmail();
        await readyForBusiness(email);
        nowSpy.mockClear();
        // Act
        await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send(baseBusinessPayload(email)),
        );
        // Assert
        const calls = nowSpy.mock.calls as [string, EmailJobData][];
        const welcomeCall = calls.find(
          (c) => c[0] === JOBS.EMAIL_WELCOME && c[1].to === email,
        );
        expect(welcomeCall).toBeDefined();
      });
    });

    describe('error cases', () => {
      it('returns 400 when the user is not found', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send(baseBusinessPayload('nobody@test.local')),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when the email has not been verified', async () => {
        // Arrange — account only, no email verification
        const email = nextEmail();
        await createAccountOnly(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send(baseBusinessPayload(email)),
        );
        // Assert
        expect(res.status).toBe(400);
        expect((res.body as ApiBody).message).toBe(
          AUTH_MESSAGES.ERROR.EMAIL_NOT_VERIFIED,
        );
      });

      it('returns 400 when the PIN has not been set', async () => {
        // Arrange — account + verify email, but skip set-pin
        const email = nextEmail();
        await accountAndVerify(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send(baseBusinessPayload(email)),
        );
        // Assert
        expect(res.status).toBe(400);
        expect((res.body as ApiBody).message).toBe(
          AUTH_MESSAGES.ERROR.PIN_NOT_SET,
        );
      });

      it('returns 400 when the businessCategory does not exist in the database', async () => {
        // Arrange
        const email = nextEmail();
        await readyForBusiness(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send({
              ...baseBusinessPayload(email),
              businessCategory: '507f1f77bcf86cd799439011',
            }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 409 when the user already has a business set up', async () => {
        // Arrange — SEEDED_USER already completed onboarding
        // Act
        const res = await authed(
          req()
            .post('/api/auth/onboarding/business')
            .send(baseBusinessPayload(SEEDED_USER.email)),
        );
        // Assert
        expect(res.status).toBe(409);
        expect((res.body as ApiBody).message).toBe(
          AUTH_MESSAGES.ERROR.BUSINESS_ALREADY_SETUP,
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/auth/login
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    describe('input validation — 400', () => {
      it.each<[string, Record<string, unknown>]>([
        ['email', { email: undefined }],
        ['password', { password: undefined }],
      ])('returns 400 when %s is missing', async (_field, override) => {
        // Arrange
        const base = {
          email: SEEDED_USER.email,
          password: SEEDED_USER.password,
        };
        // Act
        const res = await authed(
          req()
            .post('/api/auth/login')
            .send({ ...base, ...override }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when email format is invalid', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/login')
            .send({ email: 'not-an-email', password: 'Pass1234' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('happy path', () => {
      it('returns 200 with accessToken, refreshToken, and user data', async () => {
        // Arrange & Act
        const res = await authed(
          req().post('/api/auth/login').send({
            email: SEEDED_USER.email,
            password: SEEDED_USER.password,
          }),
        );
        const body = res.body as ApiBody<LoginPayload>;
        // Assert
        expect(res.status).toBe(200);
        expect(body.data?.accessToken).toBeDefined();
        expect(body.data?.refreshToken).toBeDefined();
        expect(body.data?.user.email).toBe(SEEDED_USER.email);
      });

      it('persists a refresh token record with a 7-day expiry in the database', async () => {
        // Arrange
        const loginRes = await authed(
          req().post('/api/auth/login').send({
            email: SEEDED_USER.email,
            password: SEEDED_USER.password,
          }),
        );
        const { refreshToken } = (loginRes.body as ApiBody<LoginPayload>).data!;
        // Act
        const tokenHash = hashToken(refreshToken);
        const stored = await refreshTokenModel
          .findOne({ tokenHash })
          .lean<RefreshToken>();
        // Assert
        expect(stored).not.toBeNull();
        const sevenDays = 7 * 24 * 60 * 60 * 1_000;
        expect(stored!.expiresAt.getTime()).toBeGreaterThan(
          Date.now() + sevenDays - 60_000,
        );
      });

      it('updates lastLoginAt on the user document', async () => {
        // Arrange
        const before = Date.now();
        // Act
        await authed(
          req().post('/api/auth/login').send({
            email: SEEDED_USER.email,
            password: SEEDED_USER.password,
          }),
        );
        const user = await userModel
          .findOne({ email: SEEDED_USER.email })
          .lean<User>();
        // Assert
        expect(user?.lastLoginAt?.getTime()).toBeGreaterThanOrEqual(before);
      });
    });

    describe('error cases', () => {
      it('returns 401 when the email does not exist', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/login')
            .send({ email: 'nobody@test.local', password: 'Password123' }),
        );
        // Assert
        expect(res.status).toBe(401);
      });

      it('returns 401 when the password is wrong', async () => {
        // Arrange & Act
        const res = await authed(
          req().post('/api/auth/login').send({
            email: SEEDED_USER.email,
            password: 'WrongPass1',
          }),
        );
        // Assert
        expect(res.status).toBe(401);
      });

      it('returns 401 when the user account is inactive', async () => {
        // Arrange — partially onboarded user (isActive: false)
        const email = nextEmail();
        await createAccountOnly(email);
        // Act
        const res = await authed(
          req()
            .post('/api/auth/login')
            .send({ email, password: 'Password123' }),
        );
        // Assert
        expect(res.status).toBe(401);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/auth/verify-pin
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/verify-pin', () => {
    let pinAccessToken: string;
    let seededUserId: string;

    beforeAll(async () => {
      const loginRes = await authed(
        req().post('/api/auth/login').send({
          email: SEEDED_USER.email,
          password: SEEDED_USER.password,
        }),
      );
      pinAccessToken = (loginRes.body as ApiBody<LoginPayload>).data!
        .accessToken;
      const user = await userModel
        .findOne({ email: SEEDED_USER.email })
        .lean<User>();
      seededUserId = user!._id.toString();
    });

    afterEach(async () => {
      const redisService = app.get<RedisService>(RedisService);
      await redisService.del(`pin_attempts:${seededUserId}`);
    });

    describe('input validation — 400', () => {
      it('returns 400 when pin is missing', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${pinAccessToken}`)
            .send({}),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when pin is not exactly 4 digits', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${pinAccessToken}`)
            .send({ pin: '12345' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('auth guard', () => {
      it('returns 401 when Authorization header is missing', async () => {
        // Arrange & Act
        const res = await authed(
          req().post('/api/auth/verify-pin').send({ pin: '9999' }),
        );
        // Assert
        expect(res.status).toBe(401);
      });

      it('returns 401 when the bearer token is invalid', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/verify-pin')
            .set('Authorization', 'Bearer invalid.token.here')
            .send({ pin: '9999' }),
        );
        // Assert
        expect(res.status).toBe(401);
      });
    });

    describe('happy path', () => {
      it('returns 200 with a new accessToken that has pinVerified: true', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${pinAccessToken}`)
            .send({ pin: SEEDED_USER.pin }),
        );
        // Assert
        expect(res.status).toBe(200);
        expect(
          (res.body as ApiBody<TokenPayload>).data?.accessToken,
        ).toBeDefined();
      });

      it('clears the pin_attempts counter in Redis after a successful verification', async () => {
        // Arrange — create one failed attempt first
        const redisService = app.get<RedisService>(RedisService);
        await authed(
          req()
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${pinAccessToken}`)
            .send({ pin: '0000' }),
        );
        // Act — correct pin
        await authed(
          req()
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${pinAccessToken}`)
            .send({ pin: SEEDED_USER.pin }),
        );
        // Assert
        const counter = await redisService.get(`pin_attempts:${seededUserId}`);
        expect(counter).toBeNull();
      });
    });

    describe('error cases', () => {
      it('returns 401 when the pin is wrong', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${pinAccessToken}`)
            .send({ pin: '0000' }),
        );
        // Assert
        expect(res.status).toBe(401);
      });

      it('returns 401 with PIN_LOCKED message after 3 failed attempts', async () => {
        // Arrange — exhaust all attempts
        for (let i = 0; i < 3; i++) {
          await authed(
            req()
              .post('/api/auth/verify-pin')
              .set('Authorization', `Bearer ${pinAccessToken}`)
              .send({ pin: '0000' }),
          );
        }
        // Act — 4th attempt triggers lockout
        const res = await authed(
          req()
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${pinAccessToken}`)
            .send({ pin: '0000' }),
        );
        // Assert
        expect(res.status).toBe(401);
        expect((res.body as ApiBody).message).toBe(
          AUTH_MESSAGES.ERROR.PIN_LOCKED,
        );
      });

      it('correct pin also returns 401 while the account is locked', async () => {
        // Arrange — lock the account
        for (let i = 0; i < 3; i++) {
          await authed(
            req()
              .post('/api/auth/verify-pin')
              .set('Authorization', `Bearer ${pinAccessToken}`)
              .send({ pin: '0000' }),
          );
        }
        // Act — try with the correct pin while locked
        const res = await authed(
          req()
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${pinAccessToken}`)
            .send({ pin: SEEDED_USER.pin }),
        );
        // Assert
        expect(res.status).toBe(401);
      });

      it('lockout resets after the TTL expires (time-travel via Redis key deletion)', async () => {
        // Arrange — lock the account
        for (let i = 0; i < 4; i++) {
          await authed(
            req()
              .post('/api/auth/verify-pin')
              .set('Authorization', `Bearer ${pinAccessToken}`)
              .send({ pin: '0000' }),
          );
        }
        const redisService = app.get<RedisService>(RedisService);
        // Act — simulate TTL expiry by removing the counter key
        await redisService.del(`pin_attempts:${seededUserId}`);
        const res = await authed(
          req()
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${pinAccessToken}`)
            .send({ pin: '0000' }),
        );
        // Assert — now returns 401 (wrong pin), NOT 401 PIN_LOCKED
        expect(res.status).toBe(401);
        expect((res.body as ApiBody).message).toBe(
          AUTH_MESSAGES.ERROR.INVALID_PIN,
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/auth/refresh
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    describe('input validation — 400', () => {
      it('returns 400 when refreshToken is missing', async () => {
        // Arrange & Act
        const res = await authed(req().post('/api/auth/refresh').send({}));
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('happy path', () => {
      it('returns 200 with a new accessToken', async () => {
        // Arrange
        const loginRes = await authed(
          req().post('/api/auth/login').send({
            email: SEEDED_USER.email,
            password: SEEDED_USER.password,
          }),
        );
        const { refreshToken } = (loginRes.body as ApiBody<LoginPayload>).data!;
        // Act
        const res = await authed(
          req().post('/api/auth/refresh').send({ refreshToken }),
        );
        // Assert
        expect(res.status).toBe(200);
        expect(
          (res.body as ApiBody<TokenPayload>).data?.accessToken,
        ).toBeDefined();
      });
    });

    describe('error cases', () => {
      it('returns 401 when the refresh token is not found in the database', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/refresh')
            .send({ refreshToken: 'completely-unknown-token' }),
        );
        // Assert
        expect(res.status).toBe(401);
      });

      it('returns 401 when the refresh token has expired', async () => {
        // Arrange
        const loginRes = await authed(
          req().post('/api/auth/login').send({
            email: SEEDED_USER.email,
            password: SEEDED_USER.password,
          }),
        );
        const { refreshToken } = (loginRes.body as ApiBody<LoginPayload>).data!;
        const tokenHash = hashToken(refreshToken);
        await refreshTokenModel.updateOne(
          { tokenHash },
          { $set: { expiresAt: new Date(Date.now() - 1_000) } },
        );
        // Act
        const res = await authed(
          req().post('/api/auth/refresh').send({ refreshToken }),
        );
        // Assert
        expect(res.status).toBe(401);
      });

      it('returns 401 when the refresh token has been revoked', async () => {
        // Arrange
        const loginRes = await authed(
          req().post('/api/auth/login').send({
            email: SEEDED_USER.email,
            password: SEEDED_USER.password,
          }),
        );
        const { refreshToken } = (loginRes.body as ApiBody<LoginPayload>).data!;
        await authed(req().post('/api/auth/logout').send({ refreshToken }));
        // Act
        const res = await authed(
          req().post('/api/auth/refresh').send({ refreshToken }),
        );
        // Assert
        expect(res.status).toBe(401);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/auth/logout
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    describe('input validation — 400', () => {
      it('returns 400 when refreshToken is missing', async () => {
        // Arrange & Act
        const res = await authed(req().post('/api/auth/logout').send({}));
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('happy path', () => {
      it('returns 200 and sets revokedAt on the token record', async () => {
        // Arrange
        const loginRes = await authed(
          req().post('/api/auth/login').send({
            email: SEEDED_USER.email,
            password: SEEDED_USER.password,
          }),
        );
        const { refreshToken } = (loginRes.body as ApiBody<LoginPayload>).data!;
        // Act
        const res = await authed(
          req().post('/api/auth/logout').send({ refreshToken }),
        );
        const tokenHash = hashToken(refreshToken);
        const stored = await refreshTokenModel
          .findOne({ tokenHash })
          .lean<RefreshToken>();
        // Assert
        expect(res.status).toBe(200);
        expect(stored?.revokedAt).toBeDefined();
      });

      it('returns 200 even when the token is already revoked (graceful no-op)', async () => {
        // Arrange
        const loginRes = await authed(
          req().post('/api/auth/login').send({
            email: SEEDED_USER.email,
            password: SEEDED_USER.password,
          }),
        );
        const { refreshToken } = (loginRes.body as ApiBody<LoginPayload>).data!;
        await authed(req().post('/api/auth/logout').send({ refreshToken }));
        // Act — second logout with the same token
        const res = await authed(
          req().post('/api/auth/logout').send({ refreshToken }),
        );
        // Assert
        expect(res.status).toBe(200);
      });

      it('subsequent /auth/refresh with the revoked token returns 401', async () => {
        // Arrange
        const loginRes = await authed(
          req().post('/api/auth/login').send({
            email: SEEDED_USER.email,
            password: SEEDED_USER.password,
          }),
        );
        const { refreshToken } = (loginRes.body as ApiBody<LoginPayload>).data!;
        await authed(req().post('/api/auth/logout').send({ refreshToken }));
        // Act
        const res = await authed(
          req().post('/api/auth/refresh').send({ refreshToken }),
        );
        // Assert
        expect(res.status).toBe(401);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/auth/forgot-password
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/forgot-password', () => {
    describe('input validation — 400', () => {
      it('returns 400 when email is missing', async () => {
        // Arrange & Act
        const res = await authed(
          req().post('/api/auth/forgot-password').send({}),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when email format is invalid', async () => {
        // Arrange & Act
        const res = await authed(
          req().post('/api/auth/forgot-password').send({ email: 'not-valid' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('enumeration prevention — always 200', () => {
      it('returns 200 even when the email is not registered', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/forgot-password')
            .send({ email: 'ghost@test.local' }),
        );
        // Assert
        expect(res.status).toBe(200);
      });

      it('does not schedule a reset email for a non-existent address', async () => {
        // Arrange
        nowSpy.mockClear();
        // Act
        await authed(
          req()
            .post('/api/auth/forgot-password')
            .send({ email: 'ghost@test.local' }),
        );
        // Assert
        const calls = nowSpy.mock.calls as [string, EmailJobData][];
        const resetCalls = calls.filter(
          (c) =>
            c[0] === JOBS.EMAIL_PASSWORD_RESET &&
            c[1].to === 'ghost@test.local',
        );
        expect(resetCalls).toHaveLength(0);
      });
    });

    describe('happy path', () => {
      it('returns 200 and schedules a reset email with a raw OTP', async () => {
        // Arrange
        nowSpy.mockClear();
        // Act
        const res = await authed(
          req()
            .post('/api/auth/forgot-password')
            .send({ email: RESET_USER.email }),
        );
        // Assert
        expect(res.status).toBe(200);
        const calls = nowSpy.mock.calls as [string, EmailJobData][];
        const resetCall = calls.find(
          (c) =>
            c[0] === JOBS.EMAIL_PASSWORD_RESET && c[1].to === RESET_USER.email,
        );
        expect(resetCall).toBeDefined();
        expect(resetCall![1].otp).toBeDefined();
      });

      it('stores a hashed reset token with a future expiry on the user', async () => {
        // Arrange
        nowSpy.mockClear();
        await authed(
          req()
            .post('/api/auth/forgot-password')
            .send({ email: RESET_USER.email }),
        );
        const rawOtp = capturePasswordResetOtpFor(RESET_USER.email);
        // Act
        const user = await userModel
          .findOne({ email: RESET_USER.email })
          .lean<User>();
        // Assert
        expect(user?.passwordResetToken).toBe(hashToken(rawOtp));
        expect(user?.passwordResetTokenExpiry!.getTime()).toBeGreaterThan(
          Date.now(),
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/auth/reset-password
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/reset-password', () => {
    describe('input validation — 400', () => {
      it.each<[string, Record<string, unknown>]>([
        ['otp', { otp: undefined }],
        ['newPassword', { newPassword: undefined }],
      ])('returns 400 when %s is missing', async (_field, override) => {
        // Arrange
        const base = { otp: 'sometoken', newPassword: 'NewPass123' };
        // Act
        const res = await authed(
          req()
            .post('/api/auth/reset-password')
            .send({ ...base, ...override }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when new password is shorter than 8 characters', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/reset-password')
            .send({ otp: 'token', newPassword: 'Ab1' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when new password has no uppercase letter', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/reset-password')
            .send({ otp: 'token', newPassword: 'newpass123' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('error cases', () => {
      it('returns 400 when the reset OTP is invalid', async () => {
        // Arrange & Act
        const res = await authed(
          req()
            .post('/api/auth/reset-password')
            .send({ otp: 'invalid-otp', newPassword: 'NewPass123' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });

      it('returns 400 when the reset OTP has expired', async () => {
        // Arrange
        nowSpy.mockClear();
        await authed(
          req()
            .post('/api/auth/forgot-password')
            .send({ email: RESET_USER.email }),
        );
        const rawOtp = capturePasswordResetOtpFor(RESET_USER.email);
        await userModel.updateOne(
          { email: RESET_USER.email },
          {
            $set: {
              passwordResetTokenExpiry: new Date(Date.now() - 1_000),
            },
          },
        );
        // Act
        const res = await authed(
          req()
            .post('/api/auth/reset-password')
            .send({ otp: rawOtp, newPassword: 'NewPass123' }),
        );
        // Assert
        expect(res.status).toBe(400);
      });
    });

    describe('happy path', () => {
      const newPassword = 'NewSecure123';

      it('resets the password: new password works and old password stops working', async () => {
        // Arrange
        nowSpy.mockClear();
        await authed(
          req()
            .post('/api/auth/forgot-password')
            .send({ email: RESET_USER.email }),
        );
        const rawOtp = capturePasswordResetOtpFor(RESET_USER.email);
        // Act
        const resetRes = await authed(
          req()
            .post('/api/auth/reset-password')
            .send({ otp: rawOtp, newPassword }),
        );
        const loginNew = await authed(
          req()
            .post('/api/auth/login')
            .send({ email: RESET_USER.email, password: newPassword }),
        );
        const loginOld = await authed(
          req()
            .post('/api/auth/login')
            .send({ email: RESET_USER.email, password: RESET_USER.password }),
        );
        // Assert
        expect(resetRes.status).toBe(200);
        expect(loginNew.status).toBe(200);
        expect(loginOld.status).toBe(401);
      });

      it('clears passwordResetToken and expiry from DB after a successful reset', async () => {
        // Arrange — trigger another reset since RESET_USER password changed above
        nowSpy.mockClear();
        await authed(
          req()
            .post('/api/auth/forgot-password')
            .send({ email: RESET_USER.email }),
        );
        const rawOtp = capturePasswordResetOtpFor(RESET_USER.email);
        // Act
        await authed(
          req()
            .post('/api/auth/reset-password')
            .send({ otp: rawOtp, newPassword: 'AnotherPass456' }),
        );
        const user = await userModel
          .findOne({ email: RESET_USER.email })
          .lean<User>();
        // Assert
        expect(user?.passwordResetToken).toBeUndefined();
        expect(user?.passwordResetTokenExpiry).toBeUndefined();
      });

      it('revokes all existing refresh tokens after a successful reset', async () => {
        // Arrange — log in to obtain a refresh token first
        const loginRes = await authed(
          req()
            .post('/api/auth/login')
            .send({ email: RESET_USER.email, password: 'AnotherPass456' }),
        );
        const { refreshToken } = (loginRes.body as ApiBody<LoginPayload>).data!;
        nowSpy.mockClear();
        await authed(
          req()
            .post('/api/auth/forgot-password')
            .send({ email: RESET_USER.email }),
        );
        const rawOtp = capturePasswordResetOtpFor(RESET_USER.email);
        // Act
        await authed(
          req()
            .post('/api/auth/reset-password')
            .send({ otp: rawOtp, newPassword: 'FinalPass789' }),
        );
        const refreshRes = await authed(
          req().post('/api/auth/refresh').send({ refreshToken }),
        );
        // Assert
        expect(refreshRes.status).toBe(401);
      });
    });
  });
});
