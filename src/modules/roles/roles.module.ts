import { Module } from '@nestjs/common';
import { RolesRepository } from './roles.repository';

@Module({
  providers: [RolesRepository],
  exports: [RolesRepository],
})
export class RolesModule {}
