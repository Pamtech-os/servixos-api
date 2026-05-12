import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from 'src/app.module';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { ActivityLogsService } from 'src/modules/activity-logs/services/activity-logs.service';

export interface TestApp {
  app: INestApplication;
  apiKey: string;
}

export async function createTestApp(overrideEnv: {
  databaseUrl: string;
  redisUrl: string;
}): Promise<TestApp> {
  const apiKey = 'test-api-key-integration';

  process.env.DATABASE_URL = overrideEnv.databaseUrl;
  const redisUrl = new URL(overrideEnv.redisUrl);
  process.env.REDIS_HOST = redisUrl.hostname;
  process.env.REDIS_PORT = redisUrl.port || '6379';
  process.env.JWT_SECRET = 'test-jwt-secret-integration-32chars!!';
  process.env.JWT_EXPIRES_IN = '30m';
  process.env.API_KEY = apiKey;
  process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
  process.env.ENCRYPTION_IV = 'b'.repeat(24);
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.NODE_ENV = 'test';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AgendaService)
    .useValue({
      define: jest.fn(),
      now: jest.fn().mockResolvedValue(undefined),
      schedule: jest.fn().mockResolvedValue(undefined),
      every: jest.fn().mockResolvedValue(undefined),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    })
    .overrideProvider(ActivityLogsService)
    .useValue({
      log: jest.fn().mockResolvedValue(undefined),
      listLogs: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    })
    .compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api');

  await app.init();

  return { app, apiKey };
}
