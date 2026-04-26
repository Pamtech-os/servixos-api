import { Module } from '@nestjs/common';
import { BusinessCategoriesRepository } from './business-categories.repository';

@Module({
  providers: [BusinessCategoriesRepository],
  exports: [BusinessCategoriesRepository],
})
export class BusinessCategoriesModule {}
