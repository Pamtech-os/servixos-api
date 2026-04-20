import { Module } from '@nestjs/common';
import { BusinessRepository } from './business.repository';
import { BusinessService } from './business.service';

@Module({
  providers: [BusinessRepository, BusinessService],
  exports: [BusinessRepository, BusinessService],
})
export class BusinessModule {}
