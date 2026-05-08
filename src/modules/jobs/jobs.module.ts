import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ClientsModule } from '../clients/clients.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ContractsRepository } from './repositories/contracts.repository';
import { JobsController } from './controllers/jobs.controller';
import { JobsRepository } from './repositories/jobs.repository';
import { JobsService } from './services/jobs.service';

@Module({
  imports: [BusinessModule, ClientsModule, InvoicesModule],
  controllers: [JobsController],
  providers: [JobsRepository, ContractsRepository, JobsService],
  exports: [JobsRepository, JobsService],
})
export class JobsModule {}
