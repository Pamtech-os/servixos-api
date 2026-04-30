import {
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { databaseConfig } from './config/database.config';
import { jwtConfig } from './config/jwt.config';
import { redisConfig } from './config/redis.config';
import { encryptionConfig } from './config/encryption.config';
import { mailConfig } from './config/mail.config';
import { aiConfig } from './config/ai.config';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
// import { EncryptionInterceptor } from './common/interceptors/encryption.interceptor';
// import { DecryptionMiddleware } from './common/middleware/decryption.middleware';
import { ApiKeyGuard } from './common/guards/api-key.guard';
// import { EncryptedRequestGuard } from './common/guards/encrypted-request.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BusinessModule } from './modules/business/business.module';
import { RolesModule } from './modules/roles/roles.module';
import { WebsiteModule } from './modules/website/website.module';
import { BusinessCategoriesModule } from './modules/business-categories/business-categories.module';
import { RedisModule } from './modules/redis/redis.module';
import { EmailModule } from './modules/email/email.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { SecurityModule } from './modules/security/security.module';
import { RequestsModule } from './modules/requests/requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfig,
        jwtConfig,
        redisConfig,
        encryptionConfig,
        mailConfig,
        aiConfig,
      ],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('DATABASE_URL'),
        autoIndex: true,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
      }),
    }),
    RedisModule,
    EmailModule,
    AgendaModule,
    AuthModule,
    UsersModule,
    BusinessModule,
    RolesModule,
    WebsiteModule,
    BusinessCategoriesModule,
    SecurityModule,
    RequestsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // { provide: APP_INTERCEPTOR, useClass: EncryptionInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    // { provide: APP_GUARD, useClass: EncryptedRequestGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule implements NestModule, OnModuleInit {
  private readonly logger = new Logger('MongoDB');

  constructor(@InjectConnection() private readonly connection: Connection) {}

  onModuleInit(): void {
    // readyState 1 = already connected (MongooseModule resolved before this hook)
    if (this.connection.readyState === ConnectionStates.connected) {
      this.logger.log('Database connected successfully');
    } else {
      this.connection.once('connected', () =>
        this.logger.log('Database connected successfully'),
      );
    }

    this.connection.on('disconnected', () =>
      this.logger.warn('Database disconnected'),
    );

    this.connection.on('error', (err: Error) =>
      this.logger.error(`Database connection error: ${err.message}`),
    );
  }

  configure(_consumer: MiddlewareConsumer): void {
    // DecryptionMiddleware disabled — all payloads are plain JSON
    // _consumer
    //   .apply(DecryptionMiddleware)
    //   .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
