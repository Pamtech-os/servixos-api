import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../users/users.module';
import { PermissionsController } from './controllers/permissions.controller';
import { RolesController } from './controllers/roles.controller';
import { RolesRepository } from './repositories/roles.repository';
import { RolesService } from './services/roles.service';

@Module({
  imports: [RedisModule, UsersModule],
  controllers: [RolesController, PermissionsController],
  providers: [RolesRepository, RolesService],
  exports: [RolesRepository, RolesService],
})
export class RolesModule {}
