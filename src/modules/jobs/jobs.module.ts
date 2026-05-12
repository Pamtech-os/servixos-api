import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ClientsModule } from '../clients/clients.module';
import { ContractsModule } from '../contracts/contracts.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { JobsController } from './controllers/jobs.controller';
import { JobsRepository } from './repositories/jobs.repository';
import { JobsService } from './services/jobs.service';

@Module({
  imports: [BusinessModule, ClientsModule, InvoicesModule, ContractsModule],
  controllers: [JobsController],
  providers: [JobsRepository, JobsService],
  exports: [JobsRepository, JobsService],
})
export class JobsModule {}
