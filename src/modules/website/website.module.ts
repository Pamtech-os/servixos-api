import { Module } from '@nestjs/common';
import { WebsiteConfigRepository } from './website-config.repository';

@Module({
  providers: [WebsiteConfigRepository],
  exports: [WebsiteConfigRepository],
})
export class WebsiteModule {}
