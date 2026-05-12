import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { EmailModule } from '../email/email.module';
import { JobsRepository } from '../jobs/repositories/jobs.repository';
import { RedisModule } from '../redis/redis.module';
import { ContractsController } from './controllers/contracts.controller';
import { ContractsRepository } from './repositories/contracts.repository';
import { ContractsService } from './services/contracts.service';

@Module({
  imports: [ClientsModule, EmailModule, RedisModule],
  controllers: [ContractsController],
  providers: [ContractsRepository, ContractsService, JobsRepository],
  exports: [ContractsRepository, ContractsService],
})
export class ContractsModule {}
