import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ClientsModule } from '../clients/clients.module';
import { RequestsModule } from '../requests/requests.module';
import { ContractsRepository } from '../contracts/repositories/contracts.repository';
import { JobsRepository } from '../jobs/repositories/jobs.repository';
import { InvoicesController } from './controllers/invoices.controller';
import { InvoicesRepository } from './repositories/invoices.repository';
import { InvoicesService } from './services/invoices.service';

@Module({
  imports: [BusinessModule, ClientsModule, RequestsModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesRepository,
    InvoicesService,
    JobsRepository,
    ContractsRepository,
  ],
  exports: [InvoicesRepository, InvoicesService],
})
export class InvoicesModule {}
