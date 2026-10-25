import { INestApplication } from '@nestjs/common';
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
import { JOBS } from 'src/common/constants/agenda.constants';
import { BusinessCategory } from 'src/modules/business-categories/schemas/business-category.schema';

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

interface EmailJobArgs {
  to: string;
  otp?: string;
}

describe('Tasks + Schedules (integration)', () => {
  let app: INestApplication;
  let dbConnection: Connection;
  let clientToken: string;
  let ownerAccessToken = '';
  let ownerBusinessId = '';
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
      '/servixos_tasks_schedules_test?directConnection=true';
    const redisUrl = `redis://localhost:${redisContainer.getMappedPort(6379)}`;

    ({ app } = await createTestApp({ databaseUrl, redisUrl }));
    dbConnection = app.get<Connection>(getConnectionToken());

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
      name: 'Maintenance',
      slug: 'maintenance',
      isActive: true,
    });

    const login = await fullOnboarding(
      {
        firstName: 'Task',
        lastName: 'Owner',
        email: 'task-owner@test.local',
        phone: '+12025550991',
        password: 'Password123',
        pin: '1122',
      },
      category._id.toString(),
    );

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
    const calls = nowSpy.mock.calls as [string, EmailJobArgs][];
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
          businessName: `${user.firstName} Services`,
          businessCategory: categoryId,
          businessDescription: 'Task and schedule test business.',
          timezone: 'America/New_York',
        }),
    );

    return (res.body as ApiBody<LoginPayload>).data!;
  }

  it('supports task and schedule lifecycle flows', async () => {
    const stageBootstrapEnqueued = (
      nowSpy.mock.calls as [string, { businessId?: string }][]
    ).some(
      ([jobName, payload]) =>
        jobName === JOBS.TASK_STAGES_BOOTSTRAP &&
        payload.businessId === ownerBusinessId,
    );
    expect(stageBootstrapEnqueued).toBe(true);

    const rolesRes = await asOwner(req().get('/api/roles'));
    expect(rolesRes.status).toBe(200);
    const roles = (
      rolesRes.body as ApiBody<Array<{ _id: string; name: string }>>
    ).data!;
    expect(roles.length).toBeGreaterThan(0);

    const roleId =
      roles.find((r) => r.name.toLowerCase() !== 'owner')?._id ?? roles[0]._id;

    const employeeRes = await asOwner(
      req()
        .post('/api/staff')
        .send({
          fullName: 'Alex Crew',
          email: `alex-crew-${Date.now()}@test.local`,
          roleId,
          weeklyHoursTarget: 40,
        }),
    );
    expect(employeeRes.status).toBe(201);
    const employeeId = (employeeRes.body as ApiBody<{ _id: string }>).data!._id;

    const taskRes = await asOwner(
      req().post('/api/tasks').send({
        title: 'Fix bathroom leak',
        description: 'Address leak under sink at Elm St property.',
        assigneeId: employeeId,
        priority: 'high',
        dueDate: '2026-04-20',
        stage: 'todo',
      }),
    );
    expect(taskRes.status).toBe(201);
    const taskId = (taskRes.body as ApiBody<{ _id: string }>).data!._id;

    const commentRes = await asOwner(
      req()
        .post(`/api/tasks/${taskId}/comments`)
        .send({ content: 'Parts ordered, arriving Thursday.' }),
    );
    expect(commentRes.status).toBe(200);

    const listTasksRes = await asOwner(
      req()
        .get('/api/tasks')
        .query({ assigneeId: employeeId, page: 1, limit: 10 }),
    );
    expect(listTasksRes.status).toBe(200);
    const listedTasks = (listTasksRes.body as ApiBody<Array<{ _id: string }>>)
      .data!;
    expect(listedTasks.some((t) => t._id === taskId)).toBe(true);

    const subtaskRes = await asOwner(
      req()
        .post(`/api/tasks/${taskId}/subtasks`)
        .send({ title: 'Order replacement valve' }),
    );
    expect(subtaskRes.status).toBe(200);
    const subtasks = (
      subtaskRes.body as ApiBody<{ subtasks: Array<{ _id: string }> }>
    ).data!.subtasks;
    expect(subtasks.length).toBeGreaterThan(0);

    const subtaskId = subtasks[0]._id;
    const patchSubtaskRes = await asOwner(
      req()
        .patch(`/api/tasks/${taskId}/subtasks/${subtaskId}`)
        .send({ completed: true }),
    );
    expect(patchSubtaskRes.status).toBe(200);

    const activitiesRes = await asOwner(
      req()
        .get(`/api/tasks/${taskId}/activities`)
        .query({ page: 1, limit: 20 }),
    );
    expect(activitiesRes.status).toBe(200);
    const activities = (activitiesRes.body as ApiBody<Array<{ type: string }>>)
      .data!;
    expect(activities.length).toBeGreaterThan(0);
    expect(
      activities.some((activity) => activity.type === 'comment_added'),
    ).toBe(true);

    const scheduleRes = await asOwner(
      req().post('/api/schedules').send({
        employeeId,
        shiftDate: '2026-04-14',
        startTime: '09:00',
        endTime: '17:00',
        notes: 'Morning crew',
      }),
    );
    expect(scheduleRes.status).toBe(201);

    const overlapRes = await asOwner(
      req().post('/api/schedules').send({
        employeeId,
        shiftDate: '2026-04-14',
        startTime: '10:00',
        endTime: '12:00',
      }),
    );
    expect(overlapRes.status).toBe(409);

    const listSchedulesRes = await asOwner(
      req()
        .get('/api/schedules')
        .query({ weekStartDate: '2026-04-13', employeeId }),
    );
    expect(listSchedulesRes.status).toBe(200);
    const schedules = (
      listSchedulesRes.body as ApiBody<Array<{ employeeId: string }>>
    ).data!;
    expect(schedules.length).toBeGreaterThanOrEqual(1);
  });
});
