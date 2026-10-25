import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { EmployeesModule } from '../employees/employees.module';
import { RedisModule } from '../redis/redis.module';
import { SchedulesController } from './controllers/schedules.controller';
import { ShiftsRepository } from './repositories/shifts.repository';
import { SchedulesService } from './services/schedules.service';

@Module({
  imports: [EmployeesModule, BusinessModule, RedisModule],
  controllers: [SchedulesController],
  providers: [ShiftsRepository, SchedulesService],
  exports: [ShiftsRepository, SchedulesService],
})
export class SchedulesModule {}
