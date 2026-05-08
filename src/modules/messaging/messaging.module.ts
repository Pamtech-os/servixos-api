import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MessagingRepository } from './repositories/messaging.repository';
import { MessagingService } from './services/messaging.service';
import { MessagingGateway } from './messaging.gateway';
import { MessagingController } from './controllers/messaging.controller';
import { WsAuthGuard } from 'src/common/guards/ws-auth.guard';
import { BusinessModule } from '../business/business.module';
import { ClientsModule } from '../clients/clients.module';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [
    BusinessModule,
    ClientsModule,
    EmployeesModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [MessagingController],
  providers: [
    MessagingRepository,
    MessagingService,
    MessagingGateway,
    WsAuthGuard,
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
