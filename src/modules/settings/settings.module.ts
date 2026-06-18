import { Module } from '@nestjs/common';
import { SettingsController } from './controllers/settings.controller';
import { SettingsService } from './services/settings.service';
import { BusinessModule } from '../business/business.module';
import { UsersModule } from '../users/users.module';
import { AuthRepository } from '../auth/repositories/auth.repository';

@Module({
  imports: [BusinessModule, UsersModule],
  controllers: [SettingsController],
  providers: [SettingsService, AuthRepository],
})
export class SettingsModule {}
