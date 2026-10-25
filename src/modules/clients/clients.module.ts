import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { BusinessModule } from '../business/business.module';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../users/users.module';
import { ClientsController } from './controllers/clients.controller';
import { ClientsRepository } from './repositories/clients.repository';
import { ClientsService } from './services/clients.service';

@Module({
  imports: [UsersModule, BusinessModule, AgendaModule, RedisModule],
  controllers: [ClientsController],
  providers: [ClientsRepository, ClientsService],
  exports: [ClientsRepository, ClientsService],
})
export class ClientsModule {}
