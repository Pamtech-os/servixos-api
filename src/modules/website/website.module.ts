import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { WebsiteConfigRepository } from './repositories/website-config.repository';
import { WebsiteGenerationService } from './services/website-generation.service';
import { WebsiteController } from './controllers/website.controller';

@Module({
  imports: [BusinessModule],
  controllers: [WebsiteController],
  providers: [WebsiteConfigRepository, WebsiteGenerationService],
  exports: [WebsiteConfigRepository, WebsiteGenerationService],
})
export class WebsiteModule {}
