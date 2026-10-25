import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { EmployeesModule } from '../employees/employees.module';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../users/users.module';
import { TasksController } from './controllers/tasks.controller';
import { TasksRepository } from './repositories/tasks.repository';
import { TasksService } from './services/tasks.service';

@Module({
  imports: [EmployeesModule, UsersModule, BusinessModule, RedisModule],
  controllers: [TasksController],
  providers: [TasksRepository, TasksService],
  exports: [TasksRepository, TasksService],
})
export class TasksModule {}
