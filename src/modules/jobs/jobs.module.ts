import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ClientsModule } from '../clients/clients.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ContractsRepository } from './contracts.repository';
import { JobsController } from './jobs.controller';
import { JobsRepository } from './jobs.repository';
import { JobsService } from './jobs.service';

@Module({
  imports: [BusinessModule, ClientsModule, InvoicesModule],
  controllers: [JobsController],
  providers: [JobsRepository, ContractsRepository, JobsService],
  exports: [JobsRepository, JobsService],
})
export class JobsModule {}
