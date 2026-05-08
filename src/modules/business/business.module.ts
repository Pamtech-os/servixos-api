import { Module } from '@nestjs/common';
import { BusinessRepository } from './repositories/business.repository';
import { BusinessService } from './services/business.service';

@Module({
  providers: [BusinessRepository, BusinessService],
  exports: [BusinessRepository, BusinessService],
})
export class BusinessModule {}
