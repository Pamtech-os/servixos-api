import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthRepository } from '../auth/repositories/auth.repository';
import { BusinessModule } from '../business/business.module';
import { ClientsModule } from '../clients/clients.module';
import { UsersModule } from '../users/users.module';
import { ClientAuthController } from './controllers/client-auth.controller';
import { ClientAuthService } from './services/client-auth.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('CLIENT_JWT_SECRET') ||
          config.get<string>('JWT_SECRET') ||
          'change-me-in-production',
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ||
            '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
    UsersModule,
    BusinessModule,
    ClientsModule,
  ],
  controllers: [ClientAuthController],
  providers: [ClientAuthService, AuthRepository],
})
export class ClientAuthModule {}
