import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ClientsModule } from '../clients/clients.module';
import { RequestsController } from './requests.controller';
import { RequestsRepository } from './requests.repository';
import { RequestsService } from './requests.service';

@Module({
  imports: [ClientsModule, BusinessModule],
  providers: [RequestsRepository, RequestsService],
  controllers: [RequestsController],
})
export class RequestsModule {}
