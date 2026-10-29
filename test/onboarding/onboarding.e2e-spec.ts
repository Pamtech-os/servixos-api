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
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';
import { JOBS } from 'src/common/constants/agenda.constants';
import { DiscoveryAgentService } from 'src/modules/onboarding/services/discovery-agent.service';
import { OnboardingSession } from 'src/modules/onboarding/schemas/onboarding-session.schema';

interface ApiBody<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

interface Session {
  accessToken: string;
}

const CONCEPT = {
  summary: 'Weekend meal-prep service for busy families',
  valueProposition: 'Healthy home-style meals without the cooking',
  targetCustomers: ['Working parents'],
};

let emailSeq = 0;
const nextEmail = () => `onb${++emailSeq}@test.local`;

describe('Onboarding discovery (integration)', () => {
  let app: INestApplication;
  let clientToken: string;
  let nowSpy: jest.Mock;
  let categoryId: string;
  let sessionModel: ReturnModelType<typeof OnboardingSession>;
  let streamMock: jest.Mock;
  let mongoContainer: StartedMongoDBContainer;
  let redisContainer: StartedTestContainer;

  beforeAll(async () => {
    [mongoContainer, redisContainer] = await Promise.all([
      new MongoDBContainer('mongo:7').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    ({ app } = await createTestApp({
      databaseUrl:
        mongoContainer.getConnectionString() +
        '/servixos_test?directConnection=true',
      redisUrl: `redis://localhost:${redisContainer.getMappedPort(6379)}`,
    }));

    const tokenRes = await request(app.getHttpServer() as Server).get(
      '/api/auth/client-token',
    );
    clientToken = (tokenRes.body as { data: { token: string } }).data.token;

    const connection = app.get<Connection>(getConnectionToken());
    sessionModel = getModelForClass(OnboardingSession, {
      existingConnection: connection,
    });
    const category = await getModelForClass(BusinessCategory, {
      existingConnection: connection,
    }).create({ name: 'Food', slug: 'food', isActive: true });
    categoryId = String(category._id);

    nowSpy = app.get<Record<string, jest.Mock>>(AgendaService)['now'];

    // Replace the Anthropic client so chat runs end-to-end without network calls
    streamMock = jest.fn();
    Reflect.set(app.get(DiscoveryAgentService), 'anthropic', {
      messages: { stream: streamMock },
    });
  }, 300_000);

  afterAll(async () => {
    await app.close();
    await mongoContainer.stop();
    await redisContainer.stop();
  });

  function req() {
    return request(app.getHttpServer() as Server);
  }

  function as(r: request.Test, token?: string): request.Test {
    return signRequest(
      token ? r.set('Authorization', `Bearer ${token}`) : r,
      clientToken,
    );
  }

  async function onboardingSession(email = nextEmail()): Promise<string> {
    await as(
      req().post('/api/auth/onboarding/account').send({
        firstName: 'Bola',
        lastName: 'Ade',
        email,
        phone: '+2348031234567',
        country: 'NG',
        password: 'Password123',
        confirmPassword: 'Password123',
      }),
    );
    const calls = nowSpy.mock.calls as [string, { to: string; otp?: string }][];
    const otp = [...calls]
      .reverse()
      .find((c) => c[0] === JOBS.EMAIL_VERIFICATION && c[1].to === email)![1]
      .otp;
    const res = await as(
      req().post('/api/auth/onboarding/verify-email').send({ email, otp }),
    );
    return (res.body as ApiBody<Session>).data!.accessToken;
  }

  function fakeStream(texts: string[], content: unknown[], stopReason: string) {
    const listeners: ((delta: string) => void)[] = [];
    const stream = {
      on(event: string, cb: (delta: string) => void) {
        if (event === 'text') listeners.push(cb);
        return stream;
      },
      finalMessage() {
        texts.forEach((t) => listeners.forEach((cb) => cb(t)));
        return Promise.resolve({
          content,
          stop_reason: stopReason,
          stop_details: null,
        });
      },
    };
    return stream;
  }

  function readSse(r: request.Test): request.Test {
    return r.buffer(true).parse((res, done) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => done(null, body));
    });
  }

  describe('GET /api/onboarding/session', () => {
    it('returns 401 without a session', async () => {
      // Arrange
      const sessionRequest = req().get('/api/onboarding/session');

      // Act
      const res = await as(sessionRequest);

      // Assert
      expect(res.status).toBe(401);
    });

    it('returns an empty workspace on first visit', async () => {
      // Arrange
      const token = await onboardingSession();

      // Act
      const res = await as(req().get('/api/onboarding/session'), token);

      // Assert
      expect((res.body as ApiBody).data).toEqual({
        startingPoint: null,
        profile: {},
        messages: [],
      });
    });

    it('returns 409 once the user has created a business', async () => {
      // Arrange
      const token = await onboardingSession();
      await as(
        req()
          .post('/api/auth/onboarding/set-pin')
          .send({ pin: '1234', confirmPin: '1234' }),
        token,
      );
      const businessRes = await as(
        req().post('/api/auth/onboarding/business').send({
          businessName: 'Meal Prep Co',
          businessCategory: categoryId,
          businessDescription: 'Weekend meal preparation for families.',
          timezone: 'Africa/Lagos',
        }),
        token,
      );
      const fullToken = (businessRes.body as ApiBody<Session>).data!
        .accessToken;

      // Act
      const res = await as(req().get('/api/onboarding/session'), fullToken);

      // Assert
      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /api/onboarding/profile/:section', () => {
    it('saves a user-edited section as a draft', async () => {
      // Arrange
      const token = await onboardingSession();

      // Act
      const res = await as(
        req().patch('/api/onboarding/profile/concept').send(CONCEPT),
        token,
      );

      // Assert
      expect((res.body as ApiBody).data).toMatchObject({
        ...CONCEPT,
        status: 'draft',
        updatedBy: 'user',
      });
    });

    it('returns 400 for content that fails the section schema', async () => {
      // Arrange
      const token = await onboardingSession();

      // Act
      const res = await as(
        req()
          .patch('/api/onboarding/profile/brand')
          .send({ name: 'Shine', primaryColor: 'blue' }),
        token,
      );

      // Assert
      expect(res.status).toBe(400);
    });

    it('returns 400 for an unknown section', async () => {
      // Arrange
      const token = await onboardingSession();

      // Act
      const res = await as(
        req().patch('/api/onboarding/profile/finances').send(CONCEPT),
        token,
      );

      // Assert
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/onboarding/profile/:section/approve', () => {
    it('approves a drafted section', async () => {
      // Arrange
      const token = await onboardingSession();
      await as(
        req().patch('/api/onboarding/profile/concept').send(CONCEPT),
        token,
      );

      // Act
      const res = await as(
        req().post('/api/onboarding/profile/concept/approve'),
        token,
      );

      // Assert
      expect((res.body as ApiBody).data).toMatchObject({ status: 'approved' });
    });

    it('returns 404 for a section that has not been drafted', async () => {
      // Arrange
      const token = await onboardingSession();

      // Act
      const res = await as(
        req().post('/api/onboarding/profile/brand/approve'),
        token,
      );

      // Assert
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/onboarding/chat', () => {
    it('returns 400 for an empty message', async () => {
      // Arrange
      const token = await onboardingSession();

      // Act
      const res = await as(
        req().post('/api/onboarding/chat').send({ message: '   ' }),
        token,
      );

      // Assert
      expect(res.status).toBe(400);
    });

    it('streams text, section and done events over SSE', async () => {
      // Arrange
      const token = await onboardingSession();
      streamMock
        .mockReturnValueOnce(
          fakeStream(
            [],
            [
              {
                type: 'tool_use',
                id: 'toolu_1',
                name: 'save_concept',
                input: CONCEPT,
              },
            ],
            'tool_use',
          ),
        )
        .mockReturnValueOnce(
          fakeStream(['I drafted your concept.'], [], 'end_turn'),
        );

      // Act
      const res = await readSse(
        as(
          req()
            .post('/api/onboarding/chat')
            .send({ message: 'I want to cook for families' }),
          token,
        ),
      );

      // Assert
      expect(res.body).toMatch(
        /event: section\n[\s\S]*event: text\n[\s\S]*event: done\n/,
      );
    });

    it('persists the AI-drafted section and the conversation', async () => {
      // Arrange
      const token = await onboardingSession();
      streamMock
        .mockReturnValueOnce(
          fakeStream(
            [],
            [
              {
                type: 'tool_use',
                id: 'toolu_1',
                name: 'save_concept',
                input: CONCEPT,
              },
            ],
            'tool_use',
          ),
        )
        .mockReturnValueOnce(fakeStream(['Done.'], [], 'end_turn'));
      await readSse(
        as(
          req().post('/api/onboarding/chat').send({ message: 'Meal prep' }),
          token,
        ),
      );

      // Act
      const res = await as(req().get('/api/onboarding/session'), token);

      // Assert
      expect((res.body as ApiBody).data).toMatchObject({
        profile: { concept: { ...CONCEPT, status: 'draft', updatedBy: 'ai' } },
        messages: [
          { role: 'user', content: 'Meal prep' },
          { role: 'assistant', content: 'Done.' },
        ],
      });
    });

    it('releases the chat lock so the next message can be sent', async () => {
      // Arrange
      const token = await onboardingSession();
      streamMock.mockReturnValue(fakeStream(['ok'], [], 'end_turn'));
      await readSse(
        as(req().post('/api/onboarding/chat').send({ message: 'one' }), token),
      );

      // Act
      const res = await readSse(
        as(req().post('/api/onboarding/chat').send({ message: 'two' }), token),
      );

      // Assert
      expect(res.status).toBe(200);
    });
  });

  it('keeps one session document per user', async () => {
    // Arrange
    const token = await onboardingSession();

    // Act
    await Promise.all([
      as(req().get('/api/onboarding/session'), token),
      as(req().get('/api/onboarding/session'), token),
    ]);

    // Assert
    const userCount = await sessionModel.countDocuments();
    const distinctUsers = (await sessionModel.distinct('userId')).length;
    expect(userCount).toBe(distinctUsers);
  });
});
