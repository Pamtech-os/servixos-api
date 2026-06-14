import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { BusinessModule } from '../business/business.module';
import { UsersModule } from '../users/users.module';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminBusinessesController } from './controllers/admin-businesses.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminSubscriptionsController } from './controllers/admin-subscriptions.controller';
import { AdminActivityLogsController } from './controllers/admin-activity-logs.controller';
import { AdminRolesController } from './controllers/admin-roles.controller';
import { AdminSupportController } from './controllers/admin-support.controller';
import { AdminReportsController } from './controllers/admin-reports.controller';
import { AdminRepository } from './repositories/admin.repository';
import { AdminAuthRepository } from './repositories/admin-auth.repository';
import { AdminDashboardRepository } from './repositories/admin-dashboard.repository';
import { AdminBusinessesRepository } from './repositories/admin-businesses.repository';
import { AdminUsersRepository } from './repositories/admin-users.repository';
import { AdminSubscriptionsRepository } from './repositories/admin-subscriptions.repository';
import { AdminActivityLogsRepository } from './repositories/admin-activity-logs.repository';
import { AdminRolesRepository } from './repositories/admin-roles.repository';
import { AdminSupportRepository } from './repositories/admin-support.repository';
import { AdminReportsRepository } from './repositories/admin-reports.repository';
import { AdminAuthService } from './services/admin-auth.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminSeederService } from './services/admin-seeder.service';
import { AdminBusinessesService } from './services/admin-businesses.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminSubscriptionsService } from './services/admin-subscriptions.service';
import { AdminActivityLogsService } from './services/admin-activity-logs.service';
import { AdminRolesService } from './services/admin-roles.service';
import { AdminSupportService } from './services/admin-support.service';
import { AdminReportsService } from './services/admin-reports.service';
import { JwtAdminStrategy } from './strategies/jwt-admin.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || '',
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ||
            '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
          audience: 'admin',
        },
      }),
    }),
    UsersModule,
    BusinessModule,
  ],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminUsersController,
    AdminBusinessesController,
    AdminSubscriptionsController,
    AdminActivityLogsController,
    AdminRolesController,
    AdminSupportController,
    AdminReportsController,
  ],
  providers: [
    AdminRepository,
    AdminAuthRepository,
    AdminDashboardRepository,
    AdminUsersRepository,
    AdminBusinessesRepository,
    AdminSubscriptionsRepository,
    AdminActivityLogsRepository,
    AdminRolesRepository,
    AdminSupportRepository,
    AdminReportsRepository,
    AdminAuthService,
    AdminDashboardService,
    AdminSeederService,
    AdminUsersService,
    AdminBusinessesService,
    AdminSubscriptionsService,
    AdminActivityLogsService,
    AdminRolesService,
    AdminSupportService,
    AdminReportsService,
    JwtAdminStrategy,
  ],
})
export class AdminModule {}
