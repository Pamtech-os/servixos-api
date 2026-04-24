import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { WebsiteConfigRepository } from './website-config.repository';
import { WebsiteGenerationService } from './website-generation.service';
import { WebsiteController } from './website.controller';

@Module({
  imports: [BusinessModule],
  controllers: [WebsiteController],
  providers: [WebsiteConfigRepository, WebsiteGenerationService],
  exports: [WebsiteConfigRepository, WebsiteGenerationService],
})
export class WebsiteModule {}
