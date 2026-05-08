import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsController } from './controllers/payments.controller';
import { PaymentsRepository } from './repositories/payments.repository';
import { PaymentsService } from './services/payments.service';

@Module({
  imports: [InvoicesModule, BusinessModule],
  controllers: [PaymentsController],
  providers: [PaymentsRepository, PaymentsService],
  exports: [PaymentsRepository, PaymentsService],
})
export class PaymentsModule {}
