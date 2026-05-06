import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmployeesRepository } from './employees.repository';
import { PresenceGateway } from './presence.gateway';
import { WsAuthGuard } from 'src/common/guards/ws-auth.guard';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [
    BusinessModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [EmployeesRepository, PresenceGateway, WsAuthGuard],
  exports: [EmployeesRepository],
})
export class EmployeesModule {}
