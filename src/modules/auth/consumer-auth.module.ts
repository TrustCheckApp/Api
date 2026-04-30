import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConsumerAuthController } from './consumer-auth.controller';
import { ConsumerAuthService } from './consumer-auth.service';
import { OtpService } from './otp.service';
import { LogOtpProvider } from './providers/log-otp.provider';
import { OTP_PROVIDER_TOKEN } from './providers/otp-provider.interface';
import { EventsModule } from '../../common/events/events.module';

@Module({
  imports: [
    EventsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '1d') },
      }),
    }),
  ],
  controllers: [ConsumerAuthController],
  providers: [
    ConsumerAuthService,
    OtpService,
    LogOtpProvider,
    {
      provide: OTP_PROVIDER_TOKEN,
      useClass: LogOtpProvider,
    },
  ],
  exports: [ConsumerAuthService],
})
export class ConsumerAuthModule {}
