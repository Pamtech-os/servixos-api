import { Module } from '@nestjs/common';
import { BusinessRepository } from './repositories/business.repository';
import { BusinessService } from './services/business.service';
import { BusinessController } from './controllers/business.controller';

@Module({
  controllers: [BusinessController],
  providers: [BusinessRepository, BusinessService],
  exports: [BusinessRepository, BusinessService],
})
export class BusinessModule {}
