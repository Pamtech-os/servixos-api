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
import { MessagingService } from 'src/modules/messaging/services/messaging.service';
import {
  MessageSender,
  MessageStatus,
} from 'src/modules/messaging/schemas/message.schema';
import { Message } from 'src/modules/messaging/schemas/message.schema';
import { Conversation } from 'src/modules/messaging/schemas/conversation.schema';
import { Client } from 'src/modules/clients/schemas/client.schema';
import { MESSAGING_MESSAGES } from 'src/common/constants/messages/messaging.messages';

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
  };
}

interface EmailJobArgs {
  to: string;
  otp?: string;
  title?: string;
}

// ─── Test constants ───────────────────────────────────────────────────────────

const BASE = '/api/messages';
const PHONE = '+12025550201';
const BUSINESS_DESC = 'Professional messaging test services.';

const SEEDED_USER = {
  firstName: 'Msg',
  lastName: 'Tester',
  email: 'msg-tester@messaging.test.local',
  phone: PHONE,
  password: 'Password123',
  pin: '4321',
};

const OTHER_USER = {
  firstName: 'Other',
  lastName: 'Biz',
  email: 'other-biz@messaging.test.local',
  phone: PHONE,
  password: 'Password123',
  pin: '8765',
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Messaging (integration)', () => {
  let app: INestApplication;
  let clientToken: string;
  let dbConnection: Connection;
  let messagingService: MessagingService;
  let nowSpy: jest.Mock;

  let messageModel: ReturnModelType<typeof Message>;
  let conversationModel: ReturnModelType<typeof Conversation>;
  let clientModel: ReturnModelType<typeof Client>;

  let mongoContainer: StartedMongoDBContainer;
  let redisContainer: StartedTestContainer;

  const seededUser = { accessToken: '', businessId: '' };
  const otherUser = { accessToken: '', businessId: '' };

  // ─── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    [mongoContainer, redisContainer] = await Promise.all([
      new MongoDBContainer('mongo:7').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    const databaseUrl =
      mongoContainer.getConnectionString() +
      '/servixos_messaging_test?directConnection=true';
    const redisUrl = `redis://localhost:${redisContainer.getMappedPort(6379)}`;

    ({ app } = await createTestApp({ databaseUrl, redisUrl }));
    messagingService = app.get(MessagingService);

    const tokenRes = await request(app.getHttpServer() as Server).get(
      '/api/auth/client-token',
    );
    clientToken = (tokenRes.body as { data: { token: string } }).data.token;

    dbConnection = app.get<Connection>(getConnectionToken());
    messageModel = getModelForClass(Message, {
      existingConnection: dbConnection,
    });
    conversationModel = getModelForClass(Conversation, {
      existingConnection: dbConnection,
    });
    clientModel = getModelForClass(Client, {
      existingConnection: dbConnection,
    });

    const mockAgenda = app.get<Record<string, jest.Mock>>(AgendaService);
    nowSpy = mockAgenda['now'];

    const catModel = getModelForClass(BusinessCategory, {
      existingConnection: dbConnection,
    });
    const cat = await catModel.create({
      name: 'Messaging',
      slug: 'messaging-test',
      isActive: true,
    });
    const categoryId = String(cat._id);

    const seededData = await fullOnboarding(SEEDED_USER, categoryId);
    seededUser.accessToken = seededData.accessToken;
    seededUser.businessId = seededData.user.businessId;

    const otherData = await fullOnboarding(OTHER_USER, categoryId);
    otherUser.accessToken = otherData.accessToken;
    otherUser.businessId = otherData.user.businessId;
  }, 300_000);

  afterAll(async () => {
    if (app) await app.close();
    if (mongoContainer) await mongoContainer.stop();
    if (redisContainer) await redisContainer.stop();
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function req() {
    return request(app.getHttpServer() as Server);
  }

  function authed(r: request.Test): request.Test {
    return signRequest(r, clientToken);
  }

  function asUser(
    r: request.Test,
    token: string,
    businessId: string,
  ): request.Test {
    return authed(
      r
        .set('Authorization', `Bearer ${token}`)
        .set('x-business-id', businessId),
    );
  }

  function asSeeded(r: request.Test): request.Test {
    return asUser(r, seededUser.accessToken, seededUser.businessId);
  }

  function captureOtpFor(email: string): string {
    const calls = nowSpy.mock.calls as [string, EmailJobArgs][];
    const match = [...calls].reverse().find((c) => c[1].to === email);
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
          businessName: `${user.firstName} Msg Co`,
          businessCategory: categoryId,
          businessDescription: BUSINESS_DESC,
          timezone: 'America/New_York',
        }),
    );

    return (res.body as ApiBody<LoginPayload>).data!;
  }

  async function seedClient(
    businessId: string,
    email: string,
  ): Promise<Client> {
    const [doc] = await clientModel.create([
      {
        businessId: new Types.ObjectId(businessId),
        name: 'Test Client',
        email: email.toLowerCase(),
      },
    ]);
    return doc.toObject() as Client;
  }

  async function seedConversation(
    businessId: string,
    clientId: Types.ObjectId,
  ): Promise<Conversation> {
    const [doc] = await conversationModel.create([
      {
        businessId: new Types.ObjectId(businessId),
        clientId,
      },
    ]);
    return doc.toObject() as Conversation;
  }

  async function seedMessage(
    businessId: string,
    clientId: Types.ObjectId,
    conversationId: Types.ObjectId,
    content = 'Hello from seed',
    sender = MessageSender.BUSINESS,
  ): Promise<Message> {
    const [doc] = await messageModel.create([
      {
        businessId: new Types.ObjectId(businessId),
        clientId,
        conversationId,
        sender,
        senderName: sender === MessageSender.BUSINESS ? 'Business' : 'Client',
        content,
      },
    ]);
    return doc.toObject() as Message;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/messages/conversations
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /api/messages/conversations', () => {
    it('should return 401 when no auth headers are provided', async () => {
      // Arrange & Act
      const res = await req().get(`${BASE}/conversations`);

      // Assert
      expect(res.status).toBe(401);
    });

    it('should return empty list when business has no conversations', async () => {
      // Arrange & Act
      const res = await asSeeded(req().get(`${BASE}/conversations`));

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as ApiBody<Conversation[]>;
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ page: 1, limit: 20, total: 0 });
    });

    it('should return conversations belonging to the authenticated business', async () => {
      // Arrange
      const clientEmail = `conv-test-${Date.now()}@test.local`;
      const client = await seedClient(seededUser.businessId, clientEmail);
      await seedConversation(seededUser.businessId, client._id);

      // Act
      const res = await asSeeded(req().get(`${BASE}/conversations`));

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as ApiBody<
        {
          conversationId: string;
          client: { id: string; fullName: string; email: string };
        }[]
      >;
      expect(body.data!.length).toBeGreaterThanOrEqual(1);
      expect(body.data![0].conversationId).toBeDefined();
      expect(body.data![0].client.fullName).toBe('Test Client');
      expect(body.data![0].client.email).toBe(clientEmail.toLowerCase());
    });

    it('should not return conversations from another business', async () => {
      // Arrange — create a client + conversation under otherUser's business
      const otherClientEmail = `other-conv-${Date.now()}@test.local`;
      const otherClient = await seedClient(
        otherUser.businessId,
        otherClientEmail,
      );
      await seedConversation(otherUser.businessId, otherClient._id);

      // Act — query as seededUser
      const res = await asSeeded(req().get(`${BASE}/conversations`));

      // Assert
      const body = res.body as ApiBody<
        { client: { id: string; email: string } }[]
      >;
      const otherBizConvs = body.data!.filter(
        (c) => c.client.id === otherClient._id.toString(),
      );
      expect(otherBizConvs).toHaveLength(0);
    });

    it('should respect pagination params', async () => {
      // Arrange & Act
      const res = await asSeeded(
        req().get(`${BASE}/conversations?page=1&limit=5`),
      );

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as ApiBody<unknown[]>;
      expect(body.meta).toMatchObject({ page: 1, limit: 5 });
      expect(body.data!.length).toBeLessThanOrEqual(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/messages/:clientId
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /api/messages/:clientId', () => {
    it('should return 401 when no auth headers are provided', async () => {
      // Arrange & Act
      const res = await req().get(`${BASE}/${new Types.ObjectId().toString()}`);

      // Assert
      expect(res.status).toBe(401);
    });

    it('should return 404 when the client does not exist', async () => {
      // Arrange & Act
      const res = await asSeeded(
        req().get(`${BASE}/${new Types.ObjectId().toString()}`),
      );

      // Assert
      expect(res.status).toBe(404);
    });

    it('should return 404 when the client belongs to another business', async () => {
      // Arrange — client under otherUser's business
      const email = `cross-tenant-msg-${Date.now()}@test.local`;
      const client = await seedClient(otherUser.businessId, email);

      // Act — query as seededUser
      const res = await asSeeded(req().get(`${BASE}/${client._id.toString()}`));

      // Assert
      expect(res.status).toBe(404);
    });

    it('should return empty message list for a client with no messages', async () => {
      // Arrange
      const email = `no-msgs-${Date.now()}@test.local`;
      const client = await seedClient(seededUser.businessId, email);

      // Act
      const res = await asSeeded(req().get(`${BASE}/${client._id.toString()}`));

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as ApiBody<unknown[]>;
      expect(body.success).toBe(true);
      expect(body.message).toBe(MESSAGING_MESSAGES.SUCCESS.MESSAGES_RETRIEVED);
      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ page: 1, limit: 20, total: 0 });
    });

    it('should return messages for the client scoped to the business', async () => {
      // Arrange
      const email = `with-msgs-${Date.now()}@test.local`;
      const client = await seedClient(seededUser.businessId, email);
      const conversation = await seedConversation(
        seededUser.businessId,
        client._id,
      );
      await seedMessage(
        seededUser.businessId,
        client._id,
        conversation._id,
        'First message',
      );
      await seedMessage(
        seededUser.businessId,
        client._id,
        conversation._id,
        'Second message',
        MessageSender.CLIENT,
      );

      // Act
      const res = await asSeeded(req().get(`${BASE}/${client._id.toString()}`));

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as ApiBody<{ content: string }[]>;
      expect(body.meta!.total).toBe(2);
      expect(body.data!.length).toBe(2);
    });

    it('should exclude soft-deleted messages', async () => {
      // Arrange
      const email = `with-deleted-${Date.now()}@test.local`;
      const client = await seedClient(seededUser.businessId, email);
      const conversation = await seedConversation(
        seededUser.businessId,
        client._id,
      );
      await seedMessage(
        seededUser.businessId,
        client._id,
        conversation._id,
        'Visible',
      );
      await messageModel.create([
        {
          businessId: new Types.ObjectId(seededUser.businessId),
          clientId: client._id,
          conversationId: conversation._id,
          sender: MessageSender.BUSINESS,
          senderName: 'Business',
          content: 'Deleted',
          deletedAt: new Date(),
        },
      ]);

      // Act
      const res = await asSeeded(req().get(`${BASE}/${client._id.toString()}`));

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as ApiBody<{ content: string }[]>;
      expect(body.meta!.total).toBe(1);
      expect(body.data![0].content).toBe('Visible');
    });

    it('should respect pagination params', async () => {
      // Arrange
      const email = `paginated-${Date.now()}@test.local`;
      const client = await seedClient(seededUser.businessId, email);
      const conversation = await seedConversation(
        seededUser.businessId,
        client._id,
      );
      for (let i = 0; i < 5; i++) {
        await seedMessage(
          seededUser.businessId,
          client._id,
          conversation._id,
          `Message ${i}`,
        );
      }

      // Act
      const res = await asSeeded(
        req().get(`${BASE}/${client._id.toString()}?page=1&limit=3`),
      );

      // Assert
      expect(res.status).toBe(200);
      const body = res.body as ApiBody<unknown[]>;
      expect(body.meta).toMatchObject({
        page: 1,
        limit: 3,
        total: 5,
        totalPages: 2,
      });
      expect(body.data!.length).toBe(3);
    });

    it('should reset business unread count when conversation is fetched by business', async () => {
      // Arrange
      const email = `reset-unread-${Date.now()}@test.local`;
      const client = await seedClient(seededUser.businessId, email);
      const conversation = await seedConversation(
        seededUser.businessId,
        client._id,
      );
      await seedMessage(
        seededUser.businessId,
        client._id,
        conversation._id,
        'Unread message',
        MessageSender.CLIENT,
      );
      await conversationModel.updateOne(
        { _id: conversation._id },
        { $set: { businessUnreadCount: 3 } },
      );

      // Act
      const res = await asSeeded(req().get(`${BASE}/${client._id.toString()}`));

      // Assert
      expect(res.status).toBe(200);
      const refreshed = await conversationModel
        .findById(conversation._id)
        .lean<Conversation>()
        .exec();
      expect(refreshed?.businessUnreadCount).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/messages
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /api/messages', () => {
    it('should return 400 for empty content and no attachment', async () => {
      // Arrange
      const client = await seedClient(
        seededUser.businessId,
        `empty-message-${Date.now()}@test.local`,
      );

      // Act
      const res = await asSeeded(
        req().post(BASE).send({
          clientId: client._id.toString(),
          content: '   ',
        }),
      );

      // Assert
      expect(res.status).toBe(400);
    });

    it('should persist a business message and return payload', async () => {
      // Arrange
      const client = await seedClient(
        seededUser.businessId,
        `rest-send-${Date.now()}@test.local`,
      );

      // Act
      const res = await asSeeded(
        req().post(BASE).send({
          clientId: client._id.toString(),
          content: 'Your invoice is ready for review.',
        }),
      );

      // Assert
      expect(res.status).toBe(201);
      const body = res.body as ApiBody<{ content?: string; clientId: string }>;
      expect(body.message).toBe(MESSAGING_MESSAGES.SUCCESS.MESSAGE_SENT);
      expect(body.data?.content).toBe('Your invoice is ready for review.');
      expect(body.data?.clientId).toBe(client._id.toString());

      const dbMessage = await messageModel
        .findOne({
          businessId: new Types.ObjectId(seededUser.businessId),
          clientId: client._id,
          content: 'Your invoice is ready for review.',
        })
        .lean<Message>()
        .exec();
      expect(dbMessage).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH /api/messages/read
  // ─────────────────────────────────────────────────────────────────────────────

  describe('PATCH /api/messages/read', () => {
    it('should mark messages as read up to the provided message id', async () => {
      // Arrange
      const client = await seedClient(
        seededUser.businessId,
        `mark-read-${Date.now()}@test.local`,
      );
      const conversation = await seedConversation(
        seededUser.businessId,
        client._id,
      );
      const first = await seedMessage(
        seededUser.businessId,
        client._id,
        conversation._id,
        'Client msg 1',
        MessageSender.CLIENT,
      );
      const second = await seedMessage(
        seededUser.businessId,
        client._id,
        conversation._id,
        'Client msg 2',
        MessageSender.CLIENT,
      );
      await conversationModel.updateOne(
        { _id: conversation._id },
        { $set: { businessUnreadCount: 2 } },
      );

      // Act
      const res = await asSeeded(
        req().patch(`${BASE}/read`).send({
          clientId: client._id.toString(),
          upToMessageId: second._id.toString(),
        }),
      );

      // Assert
      expect(res.status).toBe(200);
      const updated = await messageModel
        .find({
          _id: { $in: [first._id, second._id] },
        })
        .lean<Message[]>()
        .exec();
      expect(updated.every((row) => row.status === MessageStatus.READ)).toBe(
        true,
      );

      const refreshed = await conversationModel
        .findById(conversation._id)
        .lean<Conversation>()
        .exec();
      expect(refreshed?.businessUnreadCount).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Team endpoints
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Team messaging endpoints', () => {
    it('should create and list team messages', async () => {
      // Act - create
      const createRes = await asSeeded(
        req().post('/api/team/messages').send({
          content: 'Team meeting at 3pm today',
        }),
      );

      // Assert - create
      expect(createRes.status).toBe(201);
      const createdBody = createRes.body as ApiBody<{ content: string }>;
      expect(createdBody.data?.content).toBe('Team meeting at 3pm today');

      // Act - list
      const listRes = await asSeeded(req().get('/api/team/messages'));

      // Assert - list
      expect(listRes.status).toBe(200);
      const listBody = listRes.body as ApiBody<{ content: string }[]>;
      expect(listBody.data!.length).toBeGreaterThan(0);
      expect(
        listBody.data!.some(
          (row) => row.content === 'Team meeting at 3pm today',
        ),
      ).toBe(true);
    });

    it('should create and list announcements', async () => {
      const callsBefore = nowSpy.mock.calls.length;

      // Act - create
      const createRes = await asSeeded(
        req().post('/api/team/announcements').send({
          title: 'Q2 Performance Review',
          description:
            'All employees must complete self-assessments by April 30.',
        }),
      );

      // Assert - create
      expect(createRes.status).toBe(201);
      const createdBody = createRes.body as ApiBody<{ title: string }>;
      expect(createdBody.data?.title).toBe('Q2 Performance Review');

      // Allow the fire-and-forget enqueue background task to settle before
      // asserting on nowSpy — the batch loop adds an extra async hop.
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const announcementEmailCalls = (
        nowSpy.mock.calls as [string, EmailJobArgs][]
      )
        .slice(callsBefore)
        .filter(([jobName]) => jobName === JOBS.EMAIL_TEAM_ANNOUNCEMENT);

      expect(announcementEmailCalls.length).toBeGreaterThan(0);
      expect(
        announcementEmailCalls.some(
          ([, payload]) => payload.to === SEEDED_USER.email,
        ),
      ).toBe(true);
      expect(
        announcementEmailCalls.every(
          ([, payload]) => payload.title === 'Q2 Performance Review',
        ),
      ).toBe(true);

      // Act - list
      const listRes = await asSeeded(req().get('/api/team/announcements'));

      // Assert - list
      expect(listRes.status).toBe(200);
      const listBody = listRes.body as ApiBody<{ title: string }[]>;
      expect(listBody.data!.length).toBeGreaterThan(0);
      expect(
        listBody.data!.some((row) => row.title === 'Q2 Performance Review'),
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MessagingService – getOrCreateConversation (service-level)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('MessagingService.getOrCreateConversation', () => {
    it('should create a new conversation when one does not exist', async () => {
      // Arrange
      const client = await seedClient(
        seededUser.businessId,
        `new-conv-svc-${Date.now()}@test.local`,
      );

      // Act
      const { conversation, messages } =
        await messagingService.getOrCreateConversation(
          seededUser.businessId,
          client._id.toString(),
        );

      // Assert
      expect(conversation._id).toBeDefined();
      expect(conversation.businessId.toString()).toBe(seededUser.businessId);
      expect(conversation.clientId.toString()).toBe(client._id.toString());
      expect(messages).toEqual([]);
    });

    it('should return the same conversation on repeated calls (upsert idempotency)', async () => {
      // Arrange
      const client = await seedClient(
        seededUser.businessId,
        `idempotent-conv-${Date.now()}@test.local`,
      );

      // Act
      const first = await messagingService.getOrCreateConversation(
        seededUser.businessId,
        client._id.toString(),
      );
      const second = await messagingService.getOrCreateConversation(
        seededUser.businessId,
        client._id.toString(),
      );

      // Assert
      expect(first.conversation._id.toString()).toBe(
        second.conversation._id.toString(),
      );
    });

    it('should return recent messages in chronological order', async () => {
      // Arrange
      const client = await seedClient(
        seededUser.businessId,
        `conv-with-msgs-${Date.now()}@test.local`,
      );
      const conversation = await seedConversation(
        seededUser.businessId,
        client._id,
      );
      await seedMessage(
        seededUser.businessId,
        client._id,
        conversation._id,
        'Msg A',
      );
      await seedMessage(
        seededUser.businessId,
        client._id,
        conversation._id,
        'Msg B',
      );

      // Act
      const result = await messagingService.getOrCreateConversation(
        seededUser.businessId,
        client._id.toString(),
      );

      // Assert
      expect(result.messages.length).toBe(2);
      // Chronological order: A before B
      expect(result.messages[0].content).toBe('Msg A');
      expect(result.messages[1].content).toBe('Msg B');
    });
  });
});
