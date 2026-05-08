import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ClientsModule } from '../clients/clients.module';
import { UsersModule } from '../users/users.module';
import { MessagingModule } from '../messaging/messaging.module';
import { RequestsController } from './controllers/requests.controller';
import { RequestsRepository } from './repositories/requests.repository';
import { RequestsService } from './services/requests.service';

@Module({
  imports: [ClientsModule, BusinessModule, UsersModule, MessagingModule],
  providers: [RequestsRepository, RequestsService],
  controllers: [RequestsController],
})
export class RequestsModule {}
