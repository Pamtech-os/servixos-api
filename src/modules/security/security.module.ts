import { Module } from '@nestjs/common';
import { SecurityController } from './controllers/security.controller';

@Module({
  controllers: [SecurityController],
})
export class SecurityModule {}
