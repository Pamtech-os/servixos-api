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
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './common/storage/redis-throttler.storage';
import { RedisService } from './modules/redis/services/redis.service';

import { databaseConfig } from './config/database.config';
import { jwtConfig } from './config/jwt.config';
import { redisConfig } from './config/redis.config';
import { encryptionConfig } from './config/encryption.config';
import { mailConfig } from './config/mail.config';
import { aiConfig } from './config/ai.config';
import { websocketConfig } from './config/websocket.config';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { ActivityLogInterceptor } from './common/interceptors/activity-log.interceptor';
// import { EncryptionInterceptor } from './common/interceptors/encryption.interceptor';
// import { DecryptionMiddleware } from './common/middleware/decryption.middleware';
import { ChannelGuard } from './common/guards/channel.guard';
import { HmacGuard } from './common/guards/hmac.guard';
// import { EncryptedRequestGuard } from './common/guards/encrypted-request.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PinVerifiedGuard } from './common/guards/pin-verified.guard';
import { PermissionsContextGuard } from './common/guards/permissions-context.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { TenantGuard } from './common/guards/tenant.guard';

import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AiInsightsModule } from './modules/ai-insights/ai-insights.module';
import { AiAdvisorModule } from './modules/ai-advisor/ai-advisor.module';
import { AiSuggestionsModule } from './modules/ai-suggestions/ai-suggestions.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientAuthModule } from './modules/client-auth/client-auth.module';
import { ClientPortalModule } from './modules/client-portal/client-portal.module';
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
import { JobsModule } from './modules/jobs/jobs.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module';
import { ExportsModule } from './modules/exports/exports.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { FilesModule } from './modules/files/files.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { StorageModule } from './modules/storage/storage.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { AdminModule } from './modules/admin/admin.module';
import { SupportModule } from './modules/support/support.module';
import { StripeModule } from './modules/stripe/stripe.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { SettingsModule } from './modules/settings/settings.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { KybModule } from './modules/kyb/kyb.module';

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
        websocketConfig,
      ],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('DATABASE_URL'),
        // autoIndex only in non-production — on large collections ensureIndexes
        // on every deploy adds startup latency and risks holding write locks.
        autoIndex: config.get<string>('NODE_ENV') !== 'production',
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [
          // Default window: 100 requests per 60 seconds per IP.
          // Individual auth endpoints tighten this via @Throttle().
          { name: 'global', ttl: 60_000, limit: 100 },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    AnalyticsModule,
    AiInsightsModule,
    AiAdvisorModule,
    AiSuggestionsModule,
    PdfModule,
    StorageModule,
    RedisModule,
    EmailModule,
    AgendaModule,
    AuthModule,
    ClientAuthModule,
    ClientPortalModule,
    UsersModule,
    BusinessModule,
    RolesModule,
    WebsiteModule,
    BusinessCategoriesModule,
    SecurityModule,
    RequestsModule,
    JobsModule,
    EmployeesModule,
    MessagingModule,
    ClientsModule,
    ActivityLogsModule,
    ExportsModule,
    InvoicesModule,
    PaymentsModule,
    FilesModule,
    ContractsModule,
    SchedulesModule,
    TasksModule,
    ReviewsModule,
    AdminModule,
    SupportModule,
    StripeModule,
    SubscriptionModule,
    SettingsModule,
    WaitlistModule,
    KybModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // { provide: APP_INTERCEPTOR, useClass: EncryptionInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
    // ActivityLogInterceptor runs inner (after ResponseTransform) so it taps the raw handler output
    { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor },
    { provide: APP_GUARD, useClass: ChannelGuard },
    { provide: APP_GUARD, useClass: HmacGuard },
    // { provide: APP_GUARD, useClass: EncryptedRequestGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PinVerifiedGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionsContextGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
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
