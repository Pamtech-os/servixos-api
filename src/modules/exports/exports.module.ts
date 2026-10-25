import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { JobsModule } from '../jobs/jobs.module';
import { ExportsController } from './controllers/exports.controller';
import { ExportsService } from './services/exports.service';

/*
 * ExportsModule owns cross-domain data assembly (e.g. client + jobs export).
 * By living outside both ClientsModule and JobsModule it can import both freely,
 * breaking the circular dependency that would arise if either imported the other.
 *
 * Dependency graph (no cycles):
 *   ClientsModule  ←──────────┐
 *   JobsModule  → ClientsModule
 *   ExportsModule → ClientsModule
 *   ExportsModule → JobsModule
 */
@Module({
  imports: [ClientsModule, JobsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
