import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { EncryptionInterceptor } from './common/interceptors/encryption.interceptor';
import { AppLogger } from './common/utils/app-logger';
import { AppEnvironment } from './common/constants/app.constants';

const SERVIXOS_ROOT_DOMAIN = 'servixos.com';

// ---------------------------------------------------------------------------
// Environment validation — exits the process before any server port is bound
// ---------------------------------------------------------------------------
function validateEnvironment(config: ConfigService, logger: AppLogger): void {
  const required: Record<string, string> = {
    DATABASE_URL: 'xxxxxxxxxxxxxxxxxx',
    JWT_SECRET: 'xxxxxxxxxxxxxxxxxx',
    JWT_EXPIRES_IN: 'xxxxxxxxxxxxxxxxxx',
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

function isServixosSubdomainOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const { protocol, hostname } = parsed;
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return hostname.endsWith(`.${SERVIXOS_ROOT_DOMAIN}`);
  } catch {
    return false;
  }
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

  // CORS — accepts origins listed in FRONTEND_URLS plus *.servixos.com
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
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        isServixosSubdomainOrigin(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-business-id',
      'x-client-token',
      'x-timestamp',
      'x-signature',
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

  logger.log(`Server running on port ${port} [${nodeEnv}]`, 'Bootstrap');
}

void bootstrap();
