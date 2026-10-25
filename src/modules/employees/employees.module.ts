import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsAuthGuard } from 'src/common/guards/ws-auth.guard';
import { BusinessModule } from '../business/business.module';
import { RolesModule } from '../roles/roles.module';
import { UsersModule } from '../users/users.module';
import { ClockController } from './controllers/clock.controller';
import { StaffController } from './controllers/staff.controller';
import { PresenceGateway } from './presence.gateway';
import { ClockRecordsRepository } from './repositories/clock-records.repository';
import { EmployeesRepository } from './repositories/employees.repository';
import { ClockService } from './services/clock.service';
import { EmployeesService } from './services/employees.service';

@Module({
  imports: [
    BusinessModule,
    UsersModule,
    RolesModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [StaffController, ClockController],
  providers: [
    EmployeesRepository,
    ClockRecordsRepository,
    EmployeesService,
    ClockService,
    PresenceGateway,
    WsAuthGuard,
  ],
  exports: [EmployeesRepository, ClockRecordsRepository, EmployeesService],
})
export class EmployeesModule {}
