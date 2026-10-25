import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { ClientFilesController } from './controllers/client-files.controller';
import { FilesController } from './controllers/files.controller';
import { FilesRepository } from './repositories/files.repository';
import { FilesService } from './services/files.service';

@Module({
  imports: [ClientsModule],
  controllers: [ClientFilesController, FilesController],
  providers: [FilesRepository, FilesService],
  exports: [FilesRepository, FilesService],
})
export class FilesModule {}
