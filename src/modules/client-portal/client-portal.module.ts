import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthRepository } from '../auth/repositories/auth.repository';
import { BusinessModule } from '../business/business.module';
import { ClientsModule } from '../clients/clients.module';
import { ContractsModule } from '../contracts/contracts.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { JobsModule } from '../jobs/jobs.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PaymentsModule } from '../payments/payments.module';
import { RedisModule } from '../redis/redis.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { UsersModule } from '../users/users.module';
import { ClientActivitiesController } from './controllers/client-activities.controller';
import { ClientContactsController } from './controllers/client-contacts.controller';
import { ClientContractsController } from './controllers/client-contracts.controller';
import { ClientDashboardController } from './controllers/client-dashboard.controller';
import { ClientFilesController } from './controllers/client-files.controller';
import { ClientInvoicesController } from './controllers/client-invoices.controller';
import { ClientJobsController } from './controllers/client-jobs.controller';
import { ClientMessagesController } from './controllers/client-messages.controller';
import { ClientProfileController } from './controllers/client-profile.controller';
import { ClientReviewsController } from './controllers/client-reviews.controller';
import { ClientMessagesGateway } from './gateways/client-messages.gateway';
import { ClientHttpAuthGuard } from './guards/client-http-auth.guard';
import { WsJwtClientAuthGuard } from './guards/ws-jwt-client-auth.guard';
import { ClientActivitiesService } from './services/client-activities.service';
import { ClientContactsService } from './services/client-contacts.service';
import { ClientContractsService } from './services/client-contracts.service';
import { ClientDashboardService } from './services/client-dashboard.service';
import { ClientFilesService } from './services/client-files.service';
import { ClientInvoicesService } from './services/client-invoices.service';
import { ClientJobsService } from './services/client-jobs.service';
import { ClientMessagesService } from './services/client-messages.service';
import { ClientProfileService } from './services/client-profile.service';
import { ClientReviewsService } from './services/client-reviews.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('CLIENT_JWT_SECRET') ||
          config.get<string>('JWT_SECRET') ||
          '',
      }),
    }),
    UsersModule,
    ClientsModule,
    ContractsModule,
    BusinessModule,
    InvoicesModule,
    JobsModule,
    MessagingModule,
    PaymentsModule,
    RedisModule,
    ReviewsModule,
  ],
  controllers: [
    ClientDashboardController,
    ClientInvoicesController,
    ClientJobsController,
    ClientContractsController,
    ClientFilesController,
    ClientMessagesController,
    ClientContactsController,
    ClientActivitiesController,
    ClientProfileController,
    ClientReviewsController,
  ],
  providers: [
    AuthRepository,
    ClientHttpAuthGuard,
    WsJwtClientAuthGuard,
    ClientDashboardService,
    ClientInvoicesService,
    ClientJobsService,
    ClientContractsService,
    ClientFilesService,
    ClientMessagesService,
    ClientContactsService,
    ClientActivitiesService,
    ClientProfileService,
    ClientReviewsService,
    ClientMessagesGateway,
  ],
})
export class ClientPortalModule {}
