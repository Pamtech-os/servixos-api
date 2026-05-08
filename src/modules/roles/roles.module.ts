import { Module } from '@nestjs/common';
import { RolesRepository } from './repositories/roles.repository';

@Module({
  providers: [RolesRepository],
  exports: [RolesRepository],
})
export class RolesModule {}
