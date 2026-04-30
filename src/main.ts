import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { EncryptionInterceptor } from './common/interceptors/encryption.interceptor';
import { AppLogger } from './common/utils/app-logger';
import { AppEnvironment } from './common/constants/app.constants';

// ---------------------------------------------------------------------------
// Environment validation — exits the process before any server port is bound
// ---------------------------------------------------------------------------
function validateEnvironment(config: ConfigService, logger: AppLogger): void {
  const required: Record<string, string> = {
    DATABASE_URL: 'xxxxxxxxxxxxxxxxxx',
    JWT_SECRET: 'xxxxxxxxxxxxxxxxxx',
    JWT_EXPIRES_IN: 'xxxxxxxxxxxxxxxxxx',
    // REDIS_HOST: 'xxxxxxxxxxxxxxxxxx',
    // REDIS_PORT: 'xxxxxxxxxxxxxxxxxx',
    // REDIS_PASSWORD: 'xxxxxxxxxxxxxxxxxx',
    ENCRYPTION_SECRET: 'xxxxxxxxxxxxxxxxxx',
    API_KEY: 'xxxxxxxxxxxxxxxxxx',
    FRONTEND_URLS: 'xxxxxxxxxxxxxxxxxx',
  };

  const missing = Object.entries(required)
    .filter(([key]) => !config.get<string>(key))
    .map(([key, desc]) => `  · ${key} — ${desc}`);

  if (missing.length > 0) {
    logger.error(
      `Server cannot start. Missing environment variables:\n${missing.join('\n')}`,
      'EnvValidator',
    );
    process.exit(1);
  }

  logger.log('All required environment variables are present', 'EnvValidator');
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function bootstrap(): Promise<void> {
  const logger = new AppLogger('Bootstrap');

  // bufferLogs: true queues every bootstrap log (including "Nest application
  // successfully started") so they are replayed through our logger after
  // app.useLogger() — guaranteeing the INFO (green) colour on all of them.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  app.useLogger(logger);
  app.flushLogs();

  const config = app.get(ConfigService);

  validateEnvironment(config, logger);

  // Security headers
  app.use(helmet());

  // Body parsing — must sit before guards/pipes that inspect req.body.
  // json() handles application/json; urlencoded() handles HTML form posts.
  // Multipart/form-data (file uploads) is handled per-route via
  // @UseInterceptors(FileInterceptor('field')) which uses multer internally.
  const uploadLimit = config.get<string>('UPLOAD_SIZE_LIMIT') ?? '50mb';
  app.use(json({ limit: uploadLimit }));
  app.use(urlencoded({ extended: true, limit: uploadLimit }));

  // CORS — only origins listed in FRONTEND_URLS are accepted
  const allowedOrigins = config
    .get<string>('FRONTEND_URLS', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'x-business-id',
    ],
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Encryption interceptor needs DI-resolved dependencies
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new EncryptionInterceptor(config, reflector));

  app.setGlobalPrefix('api');

  const port = config.get<number>('PORT') ?? 3000;
  const nodeEnv = config.get<string>('NODE_ENV') ?? AppEnvironment.DEVELOPMENT;

  await app.listen(port);

  // app.getUrl() returns the actual bound address (e.g. http://[::1]:3000).
  // Normalise IPv6 loopback to the friendlier "localhost" for readability.
  const serverUrl = (await app.getUrl()).replace('[::1]', 'localhost');
  logger.log(`Server running on ${serverUrl}/api  [${nodeEnv}]`, 'Bootstrap');
}

void bootstrap();
