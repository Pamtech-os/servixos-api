import { Global, Module } from '@nestjs/common';
import { AgendaService } from './services/agenda.service';

@Global()
@Module({
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
