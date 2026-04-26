import { Global, Module } from '@nestjs/common';
import { AgendaService } from './agenda.service';

@Global()
@Module({
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
