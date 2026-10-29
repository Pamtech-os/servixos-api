import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './controllers/auth.controller';
import { OnboardingController } from './controllers/onboarding.controller';
import { AuthService } from './services/auth.service';
import { AuthRepository } from './repositories/auth.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { BusinessModule } from '../business/business.module';
import { RolesModule } from '../roles/roles.module';
import { WebsiteModule } from '../website/website.module';
import { BusinessCategoriesModule } from '../business-categories/business-categories.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || '',
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ||
            '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
    UsersModule,
    BusinessModule,
    RolesModule,
    WebsiteModule,
    BusinessCategoriesModule,
  ],
  controllers: [AuthController, OnboardingController],
  providers: [AuthService, AuthRepository, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
